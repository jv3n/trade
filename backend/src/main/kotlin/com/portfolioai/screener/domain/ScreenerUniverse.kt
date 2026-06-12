package com.portfolioai.screener.domain

/**
 * Broad bounds passed to the adapter to define which slice of the market to snapshot — the static
 * pre-filter the provider sees (exchange + a market-cap range bounding the call). The GUS entry
 * checklist (price $1–$10, float 3M–50M, gap ≥ 50 %, no reverse split) runs client-side after the
 * snapshot lands ; the universe is the coarse gate the adapter itself enforces.
 *
 * Honored heterogeneously per adapter: the mock honors `exchange` + the cap range; FMP honors
 * `exchange` only; Polygon's grouped-daily endpoint honors neither (see each adapter's KDoc).
 *
 * [US_SMALL_CAP_GAPPERS] is the post-pivot target — the radar now hunts the GUS pattern (gap-up
 * small-caps), not the old mid-cap surface. Captured as a constant rather than a config key; v1
 * doesn't flip universes at runtime.
 */
data class ScreenerUniverse(val exchange: String, val marketCapMin: Long, val marketCapMax: Long) {
  companion object {
    /**
     * GUS target — NASDAQ small-caps. The cap range ($1M–$2B) is a coarse gate; the real selection
     * (price $1–$10, float 3M–50M, gap ≥ 50 %) runs in the GUS checklist filter, not here.
     */
    val US_SMALL_CAP_GAPPERS =
      ScreenerUniverse(
        exchange = "NASDAQ",
        marketCapMin = 1_000_000L,
        marketCapMax = 2_000_000_000L,
      )
  }
}
