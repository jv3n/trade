package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.MarketConfig.Companion.MARKET_CHART_CACHE
import com.portfolioai.market.domain.MarketChart
import com.portfolioai.market.domain.MarketUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
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
 * Auth : the API key is read at every call from [AppConfigService] (DB override layered on top of
 * the YAML default `market.twelvedata.api-key` / env var `TWELVEDATA_API_KEY`). Reading per-call is
 * required because the user can rotate the key from `/settings/configuration` without a reboot —
 * `@Value` injection would freeze the value at bean construction. A blank key is detected at fetch
 * time and surfaced as [MarketUnavailableException] with a clear message so the front-end shows 503
 * with a meaningful hint.
 */
@Component
class TwelveDataClient(
  @Qualifier("twelveDataRestClient") private val rest: RestClient,
  private val appConfig: AppConfigService,
  @Value("\${market.twelvedata.base-url:https://api.twelvedata.com}") private val baseUrl: String,
) : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val apiKey: String
    get() = appConfig.getString(ConfigKeys.TWELVEDATA_API_KEY)

  @Cacheable(MARKET_CHART_CACHE, key = "'twelvedata|' + #symbol + '|' + #range + '|' + #interval")
  override fun fetchChart(symbol: String, range: String, interval: String): MarketChart {
    requireApiKey()
    val tdInterval = mapInterval(interval)
    val outputsize = outputSizeFor(range, tdInterval)
    val seriesResponse = fetchTimeSeries(symbol, tdInterval, outputsize)
    val bars = seriesResponse.toOhlcBars()
    if (bars.isEmpty())
      throw NoSuchElementException("Ticker $symbol returned no bars on Twelve Data")
    val quoteResponse = fetchQuote(symbol)
    // `/quote.type` is unreliable on free tier — observed null even for major US stocks (NVDA).
    // `/time_series.meta.type` carries the same classification and is populated reliably, so we
    // forward it as a fallback for the instrumentType derivation.
    return MarketChart(
      quote = quoteResponse.toTickerQuote(symbol, bars, metaType = seriesResponse.meta?.type),
      bars = bars,
    )
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
   * Number of bars to request from Twelve Data, given [range] (time horizon) and [tdInterval]
   * (Twelve-Data-style bar size). We slightly overshoot to be safe — Twelve Data returns whatever
   * is actually available for the symbol, padding doesn't happen.
   *
   * Why both arguments : `range` alone underspecifies the count. `1y` at `1day` is ~260 bars, but
   * `1y` at `1week` is ~55 — a single-arg mapping would over- or under-fetch on intraday and weekly
   * views. The cap on the free plan is 5000, comfortably above anything we ask for here.
   */
  private fun outputSizeFor(range: String, tdInterval: String): Int =
    when (tdInterval) {
      "1day" ->
        when (range.lowercase()) {
          // Daily bars on a 1d/5d window aren't visually interesting — we still cap something
          // small in case the frontend ever requests this combo.
          "1d",
          "5d" -> 30
          "1mo" -> 25
          "3mo" -> 65
          "6mo" -> 130
          "1y",
          "ytd" -> 260
          "2y" -> 520
          "5y" -> 1300
          "max" -> 5000
          else -> 260
        }
      "1week" ->
        when (range.lowercase()) {
          "1y" -> 55
          "2y" -> 110
          "5y" -> 270
          "max" -> 1500
          else -> 270
        }
      "1month" ->
        when (range.lowercase()) {
          "5y" -> 65
          "max" -> 500
          else -> 125
        }
      // Intraday — one trading day ≈ 6.5 hours. We compute bars-per-day from the interval, then
      // multiply by an approximate trading-day count for the requested range.
      else -> {
        val barsPerDay =
          when (tdInterval) {
            "1min" -> 390
            "5min" -> 78
            "15min" -> 26
            "30min" -> 13
            "1h" -> 7
            else -> 26
          }
        when (range.lowercase()) {
          "1d" -> barsPerDay + 10 // small headroom for pre-market / after-hours
          "5d" -> barsPerDay * 5 + 20
          "1mo" -> barsPerDay * 22
          else -> barsPerDay
        }
      }
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
