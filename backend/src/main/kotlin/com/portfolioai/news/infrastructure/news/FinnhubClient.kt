package com.portfolioai.news.infrastructure.news

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.news.domain.NewsItem
import java.time.LocalDate
import java.time.ZoneOffset
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP client to Finnhub's `/company-news` endpoint — the news feed for the dossier ticker.
 *
 * Endpoint contract : `GET /api/v1/company-news?symbol=AAPL&from=2026-04-01&to=2026-05-01&token=…`
 *
 * The endpoint requires both `from` and `to` dates (no "last N days" shortcut). We compute a
 * rolling 30-day window from "now" — wide enough for active tickers, narrow enough to keep the
 * payload small and the cache key stable within a day.
 *
 * Auth : `token` query parameter (not a header), read at every call from [AppConfigService] (DB
 * override on top of the YAML default `market.finnhub.api-key` / env `FINNHUB_API_KEY`). Per-call
 * reads let the user rotate the key live from `/settings/configuration` without a reboot. A blank
 * key is detected before the HTTP call so we don't waste a network round-trip on a misconfigured
 * environment.
 *
 * Error mapping (mirrors the Twelve Data adapter for consistency on the 503 / 404 path) :
 * - 401 / 403 → `MarketUnavailableException("auth-failed")`
 * - 429 → `MarketUnavailableException("rate-limited")`
 * - other 4xx → `MarketUnavailableException("client error N")`
 * - 5xx → `MarketUnavailableException("upstream N")`
 * - network timeout / DNS → `MarketUnavailableException("unreachable")`
 *
 * No `@Cacheable` here — caching is one layer up in [com.portfolioai.news.application.NewsService]
 * so the cache key reflects the user-facing `(symbol, limit)` rather than internal implementation
 * details (date window).
 */
@Component
class FinnhubClient(
  @Qualifier("finnhubRestClient") private val rest: RestClient,
  private val mapper: ObjectMapper,
  private val appConfig: AppConfigService,
  @Value("\${market.finnhub.base-url:https://finnhub.io/api/v1}") private val baseUrl: String,
) : NewsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.FINNHUB_API_KEY)

  override fun fetchNews(symbol: String, limit: Int): List<NewsItem> {
    requireApiKey()
    val upper = symbol.uppercase()
    val to = LocalDate.now(ZoneOffset.UTC)
    val from = to.minusDays(WINDOW_DAYS)
    log.info("Fetching Finnhub company-news symbol={} from={} to={}", upper, from, to)

    // Finnhub returns a JSON array, not a wrapper object — we read the body as String first then
    // deserialize via TypeReference<List<FinnhubNewsItem>>. Doing it in one go via
    // `body(Array<...>::class.java)` would also work but the TypeReference path is the standard
    // Jackson idiom for collections.
    val body =
      try {
        rest
          .get()
          .uri(
            "$baseUrl/company-news?symbol={symbol}&from={from}&to={to}&token={token}",
            upper,
            from.toString(),
            to.toString(),
            apiKey,
          )
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

    val items: List<FinnhubNewsItem> =
      mapper.readValue(body, object : TypeReference<List<FinnhubNewsItem>>() {})
    return items
      .asSequence()
      .sortedByDescending { it.datetime }
      .take(limit)
      .map { it.toDomain(upper) }
      .toList()
  }

  private fun requireApiKey() {
    if (apiKey.isBlank()) {
      throw MarketUnavailableException(
        "Finnhub API key is missing — set market.finnhub.api-key (env FINNHUB_API_KEY)"
      )
    }
  }

  companion object {
    /**
     * Rolling window of articles to request — wide enough for slow-news tickers, narrow enough to
     * keep the payload <100 KB on liquid names.
     */
    private const val WINDOW_DAYS = 30L
  }
}
