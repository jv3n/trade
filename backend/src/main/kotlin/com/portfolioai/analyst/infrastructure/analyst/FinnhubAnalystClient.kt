package com.portfolioai.analyst.infrastructure.analyst

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.MarketUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP adapter to Finnhub for analyst recommendations. Two endpoints involved :
 * - `/stock/recommendation?symbol=...` — required, returns the monthly breakdown array.
 * - `/stock/price-target?symbol=...` — optional, may 401/403 on certain accounts. We **fail soft**
 *   on the price target call and return the snapshot without it rather than failing the whole
 *   fetch.
 *
 * Auth pattern mirrors [com.portfolioai.news.infrastructure.news.FinnhubClient] : `token` query
 * parameter read at every call from [AppConfigService] so the user can rotate the Finnhub key from
 * `/settings/configuration` without a reboot. Reuses the same RestClient bean (`finnhubRestClient`)
 * — one set of timeouts and headers across all Finnhub-backed adapters.
 *
 * Error mapping is identical to the news adapter so the global error UX is uniform :
 * - 401 / 403 on `/stock/recommendation` → `MarketUnavailableException("auth-failed")`. (On the
 *   price-target call this fails soft to `null` — see above.)
 * - 429 → `MarketUnavailableException("rate-limited")`
 * - other 4xx → `MarketUnavailableException("client error N")`
 * - 5xx → `MarketUnavailableException("upstream N")`
 * - network → `MarketUnavailableException("unreachable")`
 *
 * Empty `/stock/recommendation` array → `NoSuchElementException` (mapped to 404 by the global
 * handler) — a covered ticker always has at least one bucket.
 *
 * No `@Cacheable` here — caching lives one layer up in
 * [com.portfolioai.analyst.application.AnalystRecommendationService] keyed on the uppercase symbol.
 */
@Component
class FinnhubAnalystClient(
  @Qualifier("finnhubRestClient") private val rest: RestClient,
  private val mapper: ObjectMapper,
  private val appConfig: AppConfigService,
  @Value("\${market.finnhub.base-url:https://finnhub.io/api/v1}") private val baseUrl: String,
) : AnalystRecommendationClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.FINNHUB_API_KEY)

  override fun fetch(symbol: String): AnalystSnapshot {
    requireApiKey()
    val upper = symbol.uppercase()
    log.info("Fetching Finnhub analyst recommendations symbol={}", upper)

    val recommendations = fetchRecommendations(upper)
    val priceTarget = fetchPriceTargetOrNull(upper)
    return toAnalystSnapshot(upper, recommendations, priceTarget)
  }

  private fun fetchRecommendations(upper: String): List<FinnhubRecommendationItem> {
    val body =
      try {
        rest
          .get()
          .uri("$baseUrl/stock/recommendation?symbol={symbol}&token={token}", upper, apiKey)
          .retrieve()
          .body(String::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Finnhub rate-limited symbol={}", upper)
        throw MarketUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException.Unauthorized) {
        log.warn("Finnhub returned 401 — check market.finnhub.api-key")
        throw MarketUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException.Forbidden) {
        log.warn("Finnhub returned 403 — endpoint likely behind a paid plan")
        throw MarketUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Finnhub client error {} symbol={}", e.statusCode, upper)
        throw MarketUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Finnhub server error {} symbol={}", e.statusCode, upper)
        throw MarketUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Finnhub unreachable symbol={}: {}", upper, e.message)
        throw MarketUnavailableException("unreachable", e)
      } ?: return emptyList()

    return mapper.readValue(body, object : TypeReference<List<FinnhubRecommendationItem>>() {})
  }

  /**
   * Optional second call. We deliberately swallow 401/403/4xx into a `null` because the parent
   * snapshot is still useful without the target. Server errors (5xx) and network failures are also
   * absorbed for the same reason — better degrade than fail. We log at `warn` so the operator sees
   * the issue in the Tilt logs without it bubbling to the user.
   */
  private fun fetchPriceTargetOrNull(upper: String): FinnhubPriceTarget? {
    return try {
      rest
        .get()
        .uri("$baseUrl/stock/price-target?symbol={symbol}&token={token}", upper, apiKey)
        .retrieve()
        .body(FinnhubPriceTarget::class.java)
    } catch (e: HttpClientErrorException) {
      // SLF4J treats a trailing Throwable as the cause and prints its stack trace. Swallowing
      // only the status leaves an opaque "401" in the logs ; passing the exception preserves the
      // upstream message that often clarifies whether it's a paid-tier gate or a misformed token.
      log.warn(
        "Finnhub price-target {} symbol={} — surfacing snapshot without target",
        e.statusCode,
        upper,
        e,
      )
      null
    } catch (e: HttpServerErrorException) {
      log.warn(
        "Finnhub price-target upstream {} symbol={} — surfacing snapshot without target",
        e.statusCode,
        upper,
        e,
      )
      null
    } catch (e: ResourceAccessException) {
      log.warn(
        "Finnhub price-target unreachable symbol={} — surfacing snapshot without target",
        upper,
        e,
      )
      null
    }
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw MarketUnavailableException(
        "Finnhub API key is missing — set market.finnhub.api-key (env FINNHUB_API_KEY)"
      )
    }
  }
}
