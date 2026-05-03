package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.MarketConfig.Companion.MARKET_CHART_CACHE
import com.portfolioai.market.domain.MarketChart
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
 * HTTP client to Twelve Data's REST API — the Phase 1 source for market data. Documented and
 * stable, free tier 800 credits / day, native TSX (XTSE) coverage matches our Wealthsimple use
 * case.
 *
 * Two endpoints are called per dossier load :
 * 1. `GET /time_series?symbol=…&interval=1day&outputsize=260&order=ASC&apikey=…` — OHLC series.
 * 2. `GET /quote?symbol=…&apikey=…` — issuer name + 52-week range + live close.
 *
 * Twelve Data quirks the client must absorb :
 * - **Errors are HTTP 200 with `status: "error"`** in the body. The HTTP layer alone is not enough
 *   to detect failure ; we look at the status field after deserializing.
 * - **`code: 404`** maps to [NoSuchElementException] (ticker introuvable), `code: 429` and HTTP 429
 *   map to [MarketUnavailableException] with `"rate-limited"`, `code: 401` to `"auth-failed"`.
 * - **Numeric fields are JSON strings** — see [TwelveDataMappers] for the conversion.
 *
 * Caching : 15 min Caffeine TTL ([com.portfolioai.market.MarketConfig]). The cache key is prefixed
 * with `twelvedata|` so a future provider can coexist without stepping on it.
 *
 * Auth : the API key is read from `market.twelvedata.api-key` (env var `TWELVEDATA_API_KEY`). A
 * blank key is detected at fetch time and surfaced as [MarketUnavailableException] with a clear
 * message so the front-end shows 503 with a meaningful hint.
 */
@Component
@ConditionalOnProperty(name = ["market.provider"], havingValue = "twelvedata")
class TwelveDataClient(
  private val rest: RestClient,
  @Value("\${market.twelvedata.base-url:https://api.twelvedata.com}") private val baseUrl: String,
  @Value("\${market.twelvedata.api-key:}") private val apiKey: String,
) : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  @Cacheable(MARKET_CHART_CACHE, key = "'twelvedata|' + #symbol + '|' + #range + '|' + #interval")
  override fun fetchChart(symbol: String, range: String, interval: String): MarketChart {
    requireApiKey()
    val outputsize = outputSizeFor(range)
    val tdInterval = mapInterval(interval)
    val seriesResponse = fetchTimeSeries(symbol, tdInterval, outputsize)
    val bars = seriesResponse.toOhlcBars()
    if (bars.isEmpty())
      throw NoSuchElementException("Ticker $symbol returned no bars on Twelve Data")
    val quoteResponse = fetchQuote(symbol)
    return MarketChart(quote = quoteResponse.toTickerQuote(symbol, bars), bars = bars)
  }

  private fun fetchTimeSeries(
    symbol: String,
    interval: String,
    outputsize: Int,
  ): TwelveDataTimeSeriesResponse {
    log.info(
      "Fetching Twelve Data time_series symbol={} interval={} size={}",
      symbol,
      interval,
      outputsize,
    )
    val response =
      try {
        rest
          .get()
          .uri(
            "$baseUrl/time_series?symbol={symbol}&interval={interval}&outputsize={outputsize}&order=ASC&apikey={apikey}",
            symbol,
            interval,
            outputsize,
            apiKey,
          )
          .retrieve()
          .body(TwelveDataTimeSeriesResponse::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Twelve Data rate-limited on time_series symbol={}", symbol)
        throw MarketUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Twelve Data client error {} on time_series symbol={}", e.statusCode, symbol)
        throw MarketUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Twelve Data server error {} on time_series symbol={}", e.statusCode, symbol)
        throw MarketUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Twelve Data unreachable on time_series symbol={}: {}", symbol, e.message)
        throw MarketUnavailableException("unreachable", e)
      } ?: throw MarketUnavailableException("Twelve Data returned empty body for $symbol")

    if (response.status == "error") throwForApiError(symbol, response.code, response.message)
    return response
  }

  private fun fetchQuote(symbol: String): TwelveDataQuoteResponse {
    log.info("Fetching Twelve Data quote symbol={}", symbol)
    val response =
      try {
        rest
          .get()
          .uri("$baseUrl/quote?symbol={symbol}&apikey={apikey}", symbol, apiKey)
          .retrieve()
          .body(TwelveDataQuoteResponse::class.java)
      } catch (e: HttpClientErrorException.TooManyRequests) {
        log.warn("Twelve Data rate-limited on quote symbol={}", symbol)
        throw MarketUnavailableException("rate-limited", e)
      } catch (e: HttpClientErrorException) {
        log.warn("Twelve Data client error {} on quote symbol={}", e.statusCode, symbol)
        throw MarketUnavailableException("client error ${e.statusCode}", e)
      } catch (e: HttpServerErrorException) {
        log.warn("Twelve Data server error {} on quote symbol={}", e.statusCode, symbol)
        throw MarketUnavailableException("upstream ${e.statusCode}", e)
      } catch (e: ResourceAccessException) {
        log.warn("Twelve Data unreachable on quote symbol={}: {}", symbol, e.message)
        throw MarketUnavailableException("unreachable", e)
      } ?: throw MarketUnavailableException("Twelve Data returned empty quote body for $symbol")

    if (response.status == "error") throwForApiError(symbol, response.code, response.message)
    return response
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
      404 -> throw NoSuchElementException("Ticker $symbol not found on Twelve Data ($msg)")
      429 -> throw MarketUnavailableException("rate-limited: $msg")
      401,
      403 -> throw MarketUnavailableException("auth-failed: $msg")
      else -> throw MarketUnavailableException("Twelve Data error ${code ?: "?"}: $msg")
    }
  }

  /**
   * Map our generic `range` code to a Twelve Data `outputsize`. We default to 260 daily bars (~1
   * trading year + headroom) which covers every indicator including MA200 and perf1y.
   *
   * `1y` → 260 ; `2y` → 520 ; `5y` → 1300. Twelve Data's `outputsize` cap on the free plan is 5000
   * which is comfortably above anything we ask for in Phase 1.
   */
  private fun outputSizeFor(range: String): Int =
    when (range.lowercase()) {
      "1d",
      "5d" -> 30
      "1mo" -> 30
      "3mo" -> 90
      "6mo" -> 180
      "1y" -> 260
      "2y" -> 520
      "5y" -> 1300
      "ytd" -> 260
      "max" -> 5000
      else -> 260
    }

  /** Generic `1d` → Twelve Data-style `1day`, etc. */
  private fun mapInterval(interval: String): String =
    when (interval.lowercase()) {
      "1m" -> "1min"
      "5m" -> "5min"
      "15m" -> "15min"
      "30m" -> "30min"
      "60m",
      "1h" -> "1h"
      "1d" -> "1day"
      "1wk" -> "1week"
      "1mo" -> "1month"
      else -> "1day"
    }
}
