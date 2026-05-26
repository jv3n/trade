package com.portfolioai.screener.domain

/**
 * Broad bounds passed to the adapter to define which slice of the market to snapshot. Distinct from
 * [ScreenerFilter] — the universe is the *static* pre-filter the provider sees (exchange + a
 * generous market-cap range that bounds the cost of the call), while [ScreenerFilter] is the
 * *dynamic* refinement applied in-process after the snapshot lands.
 *
 * Why two layers : when the live adapter is Polygon (or any paid provider), we want to bound the
 * number of tickers we pull on each call — that's universe. The user's runtime preferences (gap %,
 * volume ratio, sector focus) are then applied locally without burning a second API call per tweak.
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
