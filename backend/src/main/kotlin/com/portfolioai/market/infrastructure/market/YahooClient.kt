package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.MarketConfig.Companion.YAHOO_CHART_CACHE
import com.portfolioai.market.domain.MarketUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.cache.annotation.Cacheable
import org.springframework.http.client.SimpleClientHttpRequestFactory
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
 * - Yahoo blocks the default JVM `User-Agent` header. We send a browser-like UA.
 * - The endpoint is aggressively rate-limited (`429 Too Many Requests`). We cache responses for 15
 *   min via Caffeine (see [com.portfolioai.market.MarketConfig]) and translate any HTTP error into
 *   a [MarketUnavailableException] handled by the global exception handler.
 * - `range` and `interval` accept the values listed at https://query1.finance.yahoo.com
 *   (1d/5d/1mo/3mo/6mo/1y/2y/5y/10y/ytd/max for range ; 1m/5m/15m/30m/60m/1d/1wk/1mo for interval).
 *   For the Phase 1 dossier we default to 1y daily.
 */
@Component
@ConditionalOnProperty(name = ["yahoo.provider"], havingValue = "yahoo", matchIfMissing = true)
class YahooClient(
  @Value("\${yahoo.base-url:https://query1.finance.yahoo.com}") private val baseUrl: String
) : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val restClient =
    RestClient.builder()
      .baseUrl(baseUrl)
      .defaultHeader("User-Agent", USER_AGENT)
      .defaultHeader("Accept", "application/json")
      .requestFactory(
        SimpleClientHttpRequestFactory().apply {
          setConnectTimeout(5_000)
          setReadTimeout(15_000)
        }
      )
      .build()

  @Cacheable(YAHOO_CHART_CACHE, key = "#symbol + '|' + #range + '|' + #interval")
  override fun fetchChart(symbol: String, range: String, interval: String): YahooChartResult {
    log.info("Fetching Yahoo chart symbol={} range={} interval={}", symbol, range, interval)
    val response =
      try {
        restClient
          .get()
          .uri(
            "/v8/finance/chart/{symbol}?range={range}&interval={interval}",
            symbol,
            range,
            interval,
          )
          .retrieve()
          .body(YahooChartResponse::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Yahoo rate-limited fetch for symbol={}", symbol)
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

  companion object {
    // The default JVM User-Agent (`Java/21`) is blocked by Yahoo. Any reasonable
    // browser UA works.
    private const val USER_AGENT =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
}
