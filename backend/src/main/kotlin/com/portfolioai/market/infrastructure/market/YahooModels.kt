package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.math.BigDecimal

/**
 * Jackson DTOs mirroring the relevant subset of Yahoo Finance's `chart` endpoint response.
 * `@JsonIgnoreProperties(ignoreUnknown = true)` everywhere because the API is undocumented and
 * Yahoo periodically adds fields — we don't want a new key to break us.
 *
 * Endpoint : `GET
 * https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=...&interval=...`
 *
 * Response shape :
 * ```
 * { "chart": { "result": [ { "meta": {…}, "timestamp": [...], "indicators": { "quote": [{...}] } } ], "error": null } }
 * ```
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooChartResponse(val chart: YahooChartContainer)

@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooChartContainer(val result: List<YahooChartResult>?, val error: YahooChartError?)

@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooChartError(val code: String?, val description: String?)

@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooChartResult(
  val meta: YahooMeta,
  val timestamp: List<Long>?,
  val indicators: YahooIndicatorsContainer?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooMeta(
  val symbol: String,
  val currency: String?,
  val longName: String?,
  val shortName: String?,
  val fullExchangeName: String?,
  val regularMarketPrice: BigDecimal?,
  val fiftyTwoWeekHigh: BigDecimal?,
  val fiftyTwoWeekLow: BigDecimal?,
  /** Unix epoch seconds. */
  val regularMarketTime: Long?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooIndicatorsContainer(val quote: List<YahooQuoteSeries>?)

@JsonIgnoreProperties(ignoreUnknown = true)
data class YahooQuoteSeries(
  // Yahoo regularly returns `null` for individual bars when the market was
  // halted that day. We keep the lists nullable both at the top level and per
  // element to mirror that.
  val open: List<BigDecimal?>?,
  val high: List<BigDecimal?>?,
  val low: List<BigDecimal?>?,
  val close: List<BigDecimal?>?,
  val volume: List<Long?>?,
)
