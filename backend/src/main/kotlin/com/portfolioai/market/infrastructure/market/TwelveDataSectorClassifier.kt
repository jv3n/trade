package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.market.domain.SectorBenchmark
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP client to Twelve Data's `/profile` endpoint — backs the "Sector" benchmark overlay on the
 * dossier ticker chart. Reuses the same [RestClient], same auth model and same error-mapping
 * convention as [TwelveDataSymbolSearchClient] so the surface is uniform across the three Twelve
 * Data adapters.
 *
 * The endpoint shares the Twelve Data quirks already absorbed elsewhere :
 * - **Errors come back as HTTP 200 with `status: "error"`** — we inspect the body after parse.
 * - **`code: 401/403/429`** map respectively to "auth-failed" / "rate-limited", surfaced via
 *   [MarketUnavailableException] → HTTP 503 by the global handler.
 * - **`code: 404`** maps to [NoSuchElementException] → HTTP 404 (symbol unknown to Twelve Data).
 *
 * Sector resolution flow : the upstream `sector` string is normalised through [SpdrSectorEtfs]
 * (which knows the 11 GICS sectors covered by SPDR + a handful of provider-side synonyms). If
 * Twelve Data returns a sector outside the SPDR mapping (e.g. "Conglomerates" for an old
 * industrial), we throw [NoSuchElementException] — the frontend turns that into a polite "no sector
 * benchmark available" inline.
 *
 * **Caching is upstream** in [com.portfolioai.market.application.SectorClassifierService] — this
 * adapter stays dumb, the service owns the cache key shape.
 */
@Component
class TwelveDataSectorClassifier(
  @Qualifier("twelveDataRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${market.twelvedata.base-url:https://api.twelvedata.com}") private val baseUrl: String,
) : SectorClassifier {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.TWELVEDATA_API_KEY)

  override fun classify(symbol: String): SectorBenchmark {
    val trimmed = symbol.trim()
    if (trimmed.isEmpty()) throw NoSuchElementException("Symbol is blank")
    requireApiKey()
    log.info("Twelve Data /profile symbol='{}'", trimmed)

    val response =
      try {
        rest
          .get()
          .uri("$baseUrl/profile?symbol={symbol}&apikey={apikey}", trimmed, apiKey)
          .retrieve()
          .body(TwelveDataProfileResponse::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Twelve Data rate-limited on /profile symbol='{}'", trimmed)
        throw MarketUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Twelve Data client error {} on /profile symbol='{}'", e.statusCode, trimmed)
        throw MarketUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Twelve Data server error {} on /profile symbol='{}'", e.statusCode, trimmed)
        throw MarketUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Twelve Data unreachable on /profile symbol='{}': {}", trimmed, e.message)
        throw MarketUnavailableException("unreachable", e)
      } ?: throw MarketUnavailableException("Twelve Data returned empty body for /profile")

    if (response.status == "error") throwForApiError(trimmed, response.code, response.message)

    return SpdrSectorEtfs.resolve(response.sector)
      ?: throw NoSuchElementException(
        "No SPDR sector ETF mapping for $trimmed (sector='${response.sector ?: "?"}')"
      )
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw MarketUnavailableException(
        "Twelve Data API key is missing — set market.twelvedata.api-key (env TWELVEDATA_API_KEY)"
      )
    }
  }

  private fun throwForApiError(symbol: String, code: Int?, message: String?): Nothing {
    val msg = message?.take(200) ?: "unknown"
    when (code) {
      404 -> throw NoSuchElementException("Symbol not found on Twelve Data: $symbol")
      429 -> throw MarketUnavailableException("rate-limited: $msg")
      401,
      403 -> throw MarketUnavailableException("auth-failed: $msg")
      else -> throw MarketUnavailableException("Twelve Data error ${code ?: "?"}: $msg")
    }
  }
}
