package com.portfolioai.screener.domain

import java.math.BigDecimal

/**
 * Dynamic, user-editable thresholds applied to the universe snapshot to produce the radar table.
 * Separate from [ScreenerUniverse] — the universe is the broad slice fetched from the provider, the
 * filter is the refinement the user tweaks live in the UI without re-hitting the API.
 *
 * **Defaults** chosen as the broad « pump precursor » filter the user signed off on at Phase 6
 * kick-off (2026-05-25) :
 * - `gapPctMin = 5.0` — a gap of 5 % is already meaningful at the open ; below that the noise floor
 *   of normal session-to-session moves swallows the signal.
 * - `volumeRatioMin = 3.0` — three times the 30-day average volume is the threshold where the «
 *   something is happening » vibe kicks in. Real pump days run at 5–10×, but starting at 3× lets
 *   the user observe the broader band and calibrate.
 *
 * `marketCapMin` / `marketCapMax` here override the universe bounds if non-null — typical use is to
 * narrow further (e.g. "only $2B–$5B inside the $2B–$10B universe") rather than to widen.
 * `exchange` / `sector` are optional refinements ; null means « don't filter on this axis ».
 */
data class ScreenerFilter(
  val gapPctMin: BigDecimal,
  val volumeRatioMin: BigDecimal,
  val marketCapMin: Long?,
  val marketCapMax: Long?,
  val exchange: String?,
  val sector: String?,
) {
  companion object {
    val DEFAULT =
      ScreenerFilter(
        gapPctMin = BigDecimal("5.0"),
        volumeRatioMin = BigDecimal("3.0"),
        marketCapMin = null,
        marketCapMax = null,
        exchange = null,
        sector = null,
      )
  }
}
