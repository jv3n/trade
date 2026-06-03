package com.portfolioai.screener.domain

/**
 * Broad bounds passed to the adapter to define which slice of the market to snapshot — the *static*
 * pre-filter the provider sees (exchange + a generous market-cap range bounding the cost of the
 * call). The user-tweakable axes (gap %, volume ratio) are applied client-side after the snapshot
 * lands ; the universe is what the adapter itself enforces, the filter is what the UI plays with.
 *
 * **Honored heterogeneously per adapter** (Phase 6 ticket (8) v0.5 — degraded mode) :
 * - [com.portfolioai.screener.infrastructure.screener.MockMarketScreenerClient] honors both
 *   `exchange` and the `marketCapMin..marketCapMax` range (its fixtures carry both fields).
 * - [com.portfolioai.screener.infrastructure.screener.FmpMarketScreenerClient] honors `exchange`
 *   only — FMP's gainers/losers payload doesn't expose `marketCapUsd`.
 * - [com.portfolioai.screener.infrastructure.screener.PolygonMarketScreenerClient] honors neither
 *   on the grouped-daily endpoint — neither `exchange` nor `marketCapUsd` is carried.
 *
 * Closing the gap on Polygon / FMP requires the [com.portfolioai.screener] follow-up ticket (1bis)
 * — a nightly cron seeds a `ticker_reference` table with `exchange` + `market_cap_usd` from Polygon
 * `/v3/reference/tickers`, joined in-memory at snapshot time. v0.5 ships the universe pre-filter
 * **at the adapter level** so the contract is uniform even when only Mock can fully enforce it.
 *
 * The default [NASDAQ_MID_CAP] reflects the Phase 6 v1 target — mid-cap Nasdaq Composite — and is
 * deliberately captured as a constant rather than a config key. v1 doesn't need to flip universes
 * at runtime ; if a future surface (small-cap radar, NYSE radar) emerges we add a sibling constant
 * and parameterise the controller.
 */
data class ScreenerUniverse(val exchange: String, val marketCapMin: Long, val marketCapMax: Long) {
  companion object {
    /** Phase 6 v1 default — mid-cap Nasdaq Composite, $2B–$10B market cap. */
    val NASDAQ_MID_CAP =
      ScreenerUniverse(
        exchange = "NASDAQ",
        marketCapMin = 2_000_000_000L,
        marketCapMax = 10_000_000_000L,
      )
  }
}
