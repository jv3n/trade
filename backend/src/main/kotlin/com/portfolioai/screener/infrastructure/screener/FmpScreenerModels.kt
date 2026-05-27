package com.portfolioai.screener.infrastructure.screener

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.math.BigDecimal

/**
 * Response DTO for FMP's `GET /v3/stock_market/gainers` and `GET /v3/stock_market/losers` endpoints
 * — the Phase 6 v0.3 source for the market radar after the Polygon free-tier pivot failed (both
 * `/v2/snapshot/...` and `/v2/aggs/grouped/...` returned 403 on the user's Polygon Basic free plan
 * post-rebrand).
 *
 * The endpoint returns a **JSON array** (no envelope) of mover entries — Jackson deserializes to
 * `Array<FmpMoverEntry>`. Unknown fields are ignored via `@JsonIgnoreProperties(ignoreUnknown =
 * true)` per the convention shared with the Twelve Data / Finnhub / Polygon models.
 *
 * **Shape observed in the wild** (free tier, 2026) :
 * ```json
 * [
 *   { "symbol": "AAPL", "name": "Apple Inc.", "change": 2.50, "price": 180.00,
 *     "changesPercentage": 1.41, "exchange": "NASDAQ" }
 * ]
 * ```
 *
 * **What's missing vs the `TickerMover` domain model** : the endpoint does not surface `volume`,
 * `volumeAvg30d`, `marketCapUsd`, or `sector`. The adapter fills `volume` and `volumeAvg30d` with
 * `0L` and `volumeRatio` with `BigDecimal.ZERO` — the radar's `volumeRatioMin` filter becomes
 * effectively no-op when FMP is the active provider, surfaced in the UI/i18n hint.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FmpMoverEntry(
  val symbol: String?,
  val name: String?,
  /** Absolute change vs previous close (used to derive `previousClose = price - change`). */
  val change: BigDecimal?,
  val price: BigDecimal?,
  /** Already in percent (e.g., `4.21` = +4.21 %) — maps directly to `gapPct`. */
  val changesPercentage: BigDecimal?,
  /** Exchange code (e.g., `NASDAQ`, `NYSE`) — populated by FMP, unlike Polygon. */
  val exchange: String?,
)
