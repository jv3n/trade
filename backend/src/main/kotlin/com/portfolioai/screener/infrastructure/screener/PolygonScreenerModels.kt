package com.portfolioai.screener.infrastructure.screener

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.math.BigDecimal

/**
 * Response DTOs for Polygon's `GET /v2/aggs/grouped/locale/us/market/stocks/{date}` endpoint — the
 * Phase 6 v0.2 source for the market radar after the pivot away from `/v2/snapshot/...` (which
 * requires Polygon Stocks Starter — not in the free Basic plan).
 *
 * One call returns OHLCV bars for **all US stocks** on a single date. The adapter makes two calls
 * (most recent trading day + previous trading day) and joins them in memory to compute the gap %.
 *
 * **Shape observed in the wild** (free Basic, EOD-only) :
 * ```json
 * {
 *   "status": "OK",
 *   "queryCount": 1,
 *   "resultsCount": 11034,
 *   "adjusted": true,
 *   "results": [
 *     { "T": "AAPL", "o": 180.50, "h": 181.20, "l": 179.30, "c": 180.00,
 *       "v": 50000000, "vw": 180.10, "n": 250000, "t": 1693243480000 }
 *   ]
 * }
 * ```
 *
 * Non-trading days (weekend, market holiday, future date, or before EOD is committed on the free
 * tier) return `resultsCount: 0` with `results: null` or `results: []`. The adapter detects this
 * and walks the calendar back one day at a time.
 *
 * Unknown fields are ignored via `@JsonIgnoreProperties(ignoreUnknown = true)` per the convention
 * shared with the Twelve Data and Finnhub models in `market/` and `news/`.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PolygonGroupedResponse(
  val status: String?,
  val queryCount: Int?,
  val resultsCount: Int?,
  val adjusted: Boolean?,
  val results: List<PolygonGroupedBar>?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class PolygonGroupedBar(
  /** Exchange symbol (Polygon abbreviates `ticker` to `T` in the grouped daily payload). */
  val T: String?,
  /** Close — the only price field the radar consumes. */
  val c: BigDecimal?,
  /** Volume. */
  val v: Long?,
)
