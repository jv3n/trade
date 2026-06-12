package com.portfolioai.screener.domain

import java.math.BigDecimal

/**
 * Machine-checkable subset of the GUS entry checklist used **backend-side** to decide which movers
 * are worth an enrichment call. Mirrors the price + gap axes of the frontend `GUS_CRITERIA` (the
 * float axis stays client-side). Only movers clearing price + gap get enriched with float +
 * premarket volume, which bounds the per-refresh provider quota to the handful of real candidates
 * rather than the whole gainers list.
 */
object ScreenerCriteria {
  val PRICE_MIN: BigDecimal = BigDecimal("1")
  val PRICE_MAX: BigDecimal = BigDecimal("10")
  val GAP_PCT_MIN: BigDecimal = BigDecimal("50")

  fun isEnrichmentCandidate(mover: TickerMover): Boolean =
    mover.price >= PRICE_MIN && mover.price <= PRICE_MAX && mover.gapPct >= GAP_PCT_MIN
}
