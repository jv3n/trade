package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.MarketConfig.Companion.YAHOO_CHART_CACHE
import com.portfolioai.market.domain.MarketUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * HTTP client to Yahoo Finance's undocumented `chart` endpoint. Returns the raw parsed payload —
 * conversion to domain types lives in [YahooMappers] so it can be unit-tested without an HTTP
 * round-trip.
 *
 * Notes on the endpoint :
 * - **Authenticated session required.** Modern Yahoo IPs reject naive chart calls with 429s that
 *   look like rate-limits but are actually missing-auth refusals. We do the cookie + crumb dance
 *   that `yfinance` and other widely-used clients do — see [YahooSession]. Every chart call carries
 *   `?crumb=<token>` and the session cookies (auto via the shared `CookieManager` from
 *   [YahooHttpConfig]).
 * - **Browser fingerprint headers**. Recent Chrome UA + `Accept` for any media type +
 *   `Accept-Language` + `Referer` to `finance.yahoo.com` are enough — set as `defaultHeader` on the
 *   shared `RestClient`. `Origin` / `Sec-Fetch-*` were also tried but stripped silently by the
 *   legacy `HttpURLConnection` request factory ; we now use the JDK 11+ `HttpClient` via
 *   [YahooHttpConfig], which avoids that limitation.
 * - **Caching + cache-name**. We cache responses for 15 min via Caffeine
 *   ([com.portfolioai.market.MarketConfig]) and translate every HTTP error into a
 *   [MarketUnavailableException] handled by the global exception handler. The 429 response body is
 *   logged so a future fingerprint regression is diagnosable from the logs.
 * - **Crumb refresh on 401.** If Yahoo returns 401 (crumb expired server-side), we invalidate the
 *   [YahooSession] and retry the chart call once. Beyond that, we surface the error.
 * - `range` and `interval` accept the values listed at https://query1.finance.yahoo.com
 *   (1d/5d/1mo/3mo/6mo/1y/2y/5y/10y/ytd/max for range ; 1m/5m/15m/30m/60m/1d/1wk/1mo for interval).
 *   For the Phase 1 dossier we default to 1y daily.
 */
@Component
@ConditionalOnProperty(name = ["yahoo.provider"], havingValue = "yahoo", matchIfMissing = true)
class YahooClient(
  private val rest: RestClient,
  private val session: YahooSession,
  @Value("\${yahoo.base-url:https://query1.finance.yahoo.com}") private val baseUrl: String,
) : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  @Cacheable(YAHOO_CHART_CACHE, key = "#symbol + '|' + #range + '|' + #interval")
  override fun fetchChart(symbol: String, range: String, interval: String): YahooChartResult =
    doFetch(symbol, range, interval, retryAuth = true)

  private fun doFetch(
    symbol: String,
    range: String,
    interval: String,
    retryAuth: Boolean,
  ): YahooChartResult {
    val crumb = session.getCrumb()
    log.info("Fetching Yahoo chart symbol={} range={} interval={}", symbol, range, interval)
    val response =
      try {
        rest
          .get()
          .uri(
            "$baseUrl/v8/finance/chart/{symbol}?range={range}&interval={interval}&crumb={crumb}",
            symbol,
            range,
            interval,
            crumb,
          )
          .retrieve()
          .body(YahooChartResponse::class.java)
      } catch (e: HttpClientErrorException.Unauthorized) {
        // Crumb expired server-side. Invalidate the session and retry once with a fresh one.
        // Beyond that, surface as MarketUnavailableException so the front shows 503.
        if (retryAuth) {
          log.info("Yahoo returned 401 for symbol={} — refreshing session and retrying", symbol)
          session.invalidate()
          return doFetch(symbol, range, interval, retryAuth = false)
        }
        log.warn("Yahoo returned 401 even after crumb refresh for symbol={}", symbol)
        throw MarketUnavailableException("auth-failed", e)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        // Body is short ("Too Many Requests" or a JSON error) — log it so a future fingerprint
        // regression (or a real IP rate-limit) is diagnosable from the logs without re-running
        // curl.
        log.warn(
          "Yahoo rate-limited fetch for symbol={} body={}",
          symbol,
          e.responseBodyAsString.take(500),
        )
        throw MarketUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException.NotFound) {
        // Translate to NoSuchElementException so the global handler returns 404.
        throw NoSuchElementException("Ticker $symbol not found on Yahoo Finance")
      } catch (e: HttpClientErrorException) {
        log.warn("Yahoo client error {} for symbol={}", e.statusCode, symbol)
        throw MarketUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Yahoo server error {} for symbol={}", e.statusCode, symbol)
        throw MarketUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        // Connect / read timeouts, DNS failures…
        log.warn("Yahoo unreachable for symbol={}: {}", symbol, e.message)
        throw MarketUnavailableException("unreachable", e)
      }

    if (response == null) throw MarketUnavailableException("empty response for $symbol")
    response.chart.error?.let {
      throw MarketUnavailableException("Yahoo API error: ${it.code ?: "?"} ${it.description ?: ""}")
    }
    return response.chart.result?.firstOrNull()
      ?: throw NoSuchElementException("No chart result for $symbol")
  }
}
