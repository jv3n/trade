package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.SymbolMatch
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
 * HTTP client to Twelve Data's `/symbol_search` endpoint — backs the watchlist autocomplete and the
 * "is this symbol real ?" validation gate.
 *
 * Reuses the same [RestClient] as [TwelveDataClient] and the same auth model — API key read at
 * every call from [AppConfigService] so the user can rotate it from `/settings/configuration`
 * without a reboot. Blank key surfaces a clear [UpstreamUnavailableException] before the HTTP call.
 *
 * The endpoint shares the Twelve Data quirks already absorbed by the chart adapter :
 * - **Errors come back as HTTP 200 with `status: "error"`** — we look at the field after
 *   deserialise.
 * - **`code: 401/403/429`** map respectively to "auth-failed" / "rate-limited" — same surface as
 *   the chart adapter, so the front gets a unified 503.
 *
 * **Caching is upstream** (in [com.portfolioai.market.application.SymbolSearchService]) rather than
 * here — keeps the adapter dumb and lets the service own normalisation of the cache key.
 */
@Component
class TwelveDataSymbolSearchClient(
  @Qualifier("twelveDataRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${market.twelvedata.base-url:https://api.twelvedata.com}") private val baseUrl: String,
) : SymbolSearchClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.TWELVEDATA_API_KEY)

  override fun search(query: String, limit: Int): List<SymbolMatch> {
    val trimmed = query.trim()
    if (trimmed.isEmpty()) return emptyList()
    requireApiKey()
    // The caller is trusted to pass a sane [limit] — `SymbolSearchService.search` clamps to
    // `[1, MAX_LIMIT]` upstream, so the adapter doesn't double-clamp.
    log.info("Twelve Data symbol_search query='{}' limit={}", trimmed, limit)

    val response =
      try {
        rest
          .get()
          .uri(
            "$baseUrl/symbol_search?symbol={symbol}&outputsize={outputsize}&apikey={apikey}",
            trimmed,
            limit,
            apiKey,
          )
          .retrieve()
          .body(TwelveDataSymbolSearchResponse::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Twelve Data rate-limited on symbol_search query='{}'", trimmed)
        throw UpstreamUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Twelve Data client error {} on symbol_search query='{}'", e.statusCode, trimmed)
        throw UpstreamUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Twelve Data server error {} on symbol_search query='{}'", e.statusCode, trimmed)
        throw UpstreamUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Twelve Data unreachable on symbol_search query='{}': {}", trimmed, e.message)
        throw UpstreamUnavailableException("unreachable", e)
      } ?: throw UpstreamUnavailableException("Twelve Data returned empty body for symbol_search")

    if (response.status == "error") throwForApiError(response.code, response.message)
    return (response.data ?: emptyList()).mapNotNull { it.toMatch() }
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw UpstreamUnavailableException(
        "Twelve Data API key is missing — set market.twelvedata.api-key (env TWELVEDATA_API_KEY)"
      )
    }
  }

  private fun throwForApiError(code: Int?, message: String?): Nothing {
    val msg = message?.take(200) ?: "unknown"
    when (code) {
      429 -> throw UpstreamUnavailableException("rate-limited: $msg")
      401,
      403 -> throw UpstreamUnavailableException("auth-failed: $msg")
      else -> throw UpstreamUnavailableException("Twelve Data error ${code ?: "?"}: $msg")
    }
  }

  /**
   * Drops entries with a missing symbol (defensive — Twelve Data sometimes returns rows with empty
   * fields for delisted instruments). Falls back to "—" for missing exchange so the UI has
   * something stable to render.
   */
  private fun TwelveDataSymbolSearchEntry.toMatch(): SymbolMatch? {
    val sym = symbol?.takeIf { it.isNotBlank() } ?: return null
    return SymbolMatch(
      symbol = sym,
      name = instrumentName?.takeIf { it.isNotBlank() } ?: sym,
      exchange = exchange?.takeIf { it.isNotBlank() } ?: "—",
    )
  }
}
