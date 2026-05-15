package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.SectorBenchmark
import com.portfolioai.shared.UpstreamUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP adapter for Finnhub `/stock/profile2` — backs the "Sector" benchmark overlay on the dossier
 * ticker chart. Replaced the original [Twelve Data `/profile`-based adapter][SectorClassifier] when
 * we discovered Twelve Data gates that endpoint behind paid plans, making the feature unusable on
 * the free tier we standardised the project on. Finnhub's `/stock/profile2` is on the free tier (60
 * calls / min, no daily cap), shares the auth + RestClient infra already wired up for news /
 * analyst / earnings, and returns enough info (`finnhubIndustry`) to drive the SPDR mapping.
 *
 * Auth pattern mirrors [com.portfolioai.news.infrastructure.news.FinnhubClient] : `token` query
 * parameter read at every call from [AppConfigService] so the user can rotate the Finnhub key from
 * `/settings/configuration` without a reboot. Reuses the same RestClient bean (`finnhubRestClient`)
 * — one set of timeouts and headers across every Finnhub-backed adapter.
 *
 * Error mapping is identical to the rest of the Finnhub stack so the global error UX is uniform :
 * - 401 / 403 → `UpstreamUnavailableException("auth-failed")` → HTTP 503
 * - 429 → `UpstreamUnavailableException("rate-limited")`
 * - other 4xx → `UpstreamUnavailableException("client error N")`
 * - 5xx → `UpstreamUnavailableException("upstream N")`
 * - network → `UpstreamUnavailableException("unreachable")`
 *
 * Sector resolution flow : the upstream `finnhubIndustry` string is normalised through
 * [SpdrSectorEtfs] (which knows the 11 GICS sectors covered by SPDR + a handful of provider-side
 * synonyms, including the Finnhub-specific labels added when we cut over). If Finnhub returns a
 * sector outside the SPDR mapping, we throw [NoSuchElementException] — the front turns that into a
 * polite "no sector benchmark available" inline.
 *
 * Empty profile body (`{}`, no ticker echoed back) → [NoSuchElementException] : Finnhub uses this
 * shape rather than HTTP 404 when the symbol isn't in their universe.
 *
 * **Caching is upstream** in [com.portfolioai.market.application.SectorClassifierService] — this
 * adapter stays dumb, the service owns the cache key shape.
 */
@Component
class FinnhubSectorClassifier(
  @Qualifier("finnhubRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${market.finnhub.base-url:https://finnhub.io/api/v1}") private val baseUrl: String,
) : SectorClassifier {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.FINNHUB_API_KEY)

  override fun classify(symbol: String): SectorBenchmark {
    // Caller contract (per [SectorClassifierService]) is "trimmed + uppercase". We rely on it
    // rather than re-normalising — see audit 2026-05-06 finding "coutures benchmark v2". The
    // blank check stays as a defensive safety net for direct programmatic callers.
    if (symbol.isBlank()) throw NoSuchElementException("Symbol is blank")
    requireApiKey()
    log.info("Finnhub /stock/profile2 symbol={}", symbol)

    val response =
      try {
        rest
          .get()
          .uri("$baseUrl/stock/profile2?symbol={symbol}&token={token}", symbol, apiKey)
          .retrieve()
          .body(FinnhubCompanyProfile::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Finnhub rate-limited on /stock/profile2 symbol={}", symbol)
        throw UpstreamUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException.Unauthorized) {
        log.warn("Finnhub returned 401 on /stock/profile2 — check market.finnhub.api-key")
        throw UpstreamUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException.Forbidden) {
        log.warn("Finnhub returned 403 on /stock/profile2 — endpoint behind a paid plan?")
        throw UpstreamUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Finnhub client error {} on /stock/profile2 symbol={}", e.statusCode, symbol)
        throw UpstreamUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Finnhub server error {} on /stock/profile2 symbol={}", e.statusCode, symbol)
        throw UpstreamUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Finnhub unreachable on /stock/profile2 symbol={}: {}", symbol, e.message)
        throw UpstreamUnavailableException("unreachable", e)
      } ?: throw UpstreamUnavailableException("Finnhub returned empty body for /stock/profile2")

    // Finnhub's "we don't cover this symbol" signal is an empty profile object — `ticker` is null
    // / blank and `finnhubIndustry` is null. Distinct from a plotting failure (5xx, rate-limit,
    // auth) — the front maps this to 404 → "no sector mapping" empty state.
    if (response.ticker.isNullOrBlank()) {
      throw NoSuchElementException("Symbol not found on Finnhub: $symbol")
    }

    return SpdrSectorEtfs.resolve(response.finnhubIndustry)
      ?: throw NoSuchElementException(
        "No SPDR sector ETF mapping for $symbol (industry='${response.finnhubIndustry ?: "?"}')"
      )
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw UpstreamUnavailableException(
        "Finnhub API key is missing — set market.finnhub.api-key (env FINNHUB_API_KEY)"
      )
    }
  }
}
