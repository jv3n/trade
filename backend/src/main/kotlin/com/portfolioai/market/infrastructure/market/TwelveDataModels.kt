package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Jackson DTOs mirroring the relevant subset of Twelve Data REST responses :
 * - `GET /time_series` for the OHLC series
 * - `GET /quote` for the latest quote, name and 52-week range
 *
 * Why two endpoints : `/time_series` does not include the 52-week range nor the issuer name, both
 * of which we want to display in the dossier header. We pay one extra credit per dossier load — the
 * Caffeine cache (15 min) keeps the daily total well under the free tier (800 credits / day).
 *
 * Twelve Data quirks worth remembering :
 * - **Numeric fields are JSON strings** (`"open": "180.00"`). We deserialize them as `String` and
 *   convert on the way out — keeps the boundary tolerant of "" / "NaN" responses observed on
 *   illiquid tickers.
 * - **Errors come back as HTTP 200** with `status: "error"` in the body — the HTTP layer alone
 *   isn't enough to detect a bad response. See [TwelveDataClient.parseTimeSeries].
 * - `@JsonIgnoreProperties(ignoreUnknown = true)` everywhere : Twelve Data adds fields silently and
 *   we only need the subset listed below.
 *
 * Reference : https://twelvedata.com/docs#time-series and https://twelvedata.com/docs#quote
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataTimeSeriesResponse(
  val meta: TwelveDataTimeSeriesMeta?,
  val values: List<TwelveDataBar>?,
  val status: String?,
  val code: Int?,
  val message: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataTimeSeriesMeta(
  val symbol: String?,
  val interval: String?,
  val currency: String?,
  val exchange: String?,
  val type: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataBar(
  /** ISO local date (`yyyy-MM-dd`) or local datetime (`yyyy-MM-dd HH:mm:ss`) per interval. */
  val datetime: String,
  val open: String?,
  val high: String?,
  val low: String?,
  val close: String?,
  val volume: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataQuoteResponse(
  val symbol: String?,
  val name: String?,
  val exchange: String?,
  val currency: String?,
  val datetime: String?,
  /** Unix epoch seconds at the time of the quote. */
  val timestamp: Long?,
  val close: String?,
  @JsonProperty("fifty_two_week") val fiftyTwoWeek: TwelveDataFiftyTwoWeek?,
  val status: String?,
  val code: Int?,
  val message: String?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class TwelveDataFiftyTwoWeek(val low: String?, val high: String?)
