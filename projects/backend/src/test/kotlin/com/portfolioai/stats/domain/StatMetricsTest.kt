package com.portfolioai.stats.domain

import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatMetrics] — the pure percentage calculations behind the stats KPIs. Since #187
 * no percentage is stored : gap, premarket push and every session level are recomputed from the
 * prices, here and in `features/stats/stats.math.ts` on the front.
 *
 * What it pins :
 * - the encoding contract — whole-number percentage, 2 decimals, `HALF_UP` ;
 * - the sign convention — a negative session percentage means the level sat **below** the open,
 *   which is the favourable side for a short ;
 * - the null-safety contract — a missing price or a non-positive base yields null rather than a
 *   division blow-up, so a stat still "to complete" simply contributes nothing to an average ;
 * - the quantiles behind the « À l'open » references (#261) — interpolated like the spreadsheet
 *   `PERCENTILE.INC`, so a figure can be checked by hand.
 *
 * No Spring / DB here.
 */
class StatMetricsTest {

  // ---------------------------------------------------------------------------
  // Premarket
  // ---------------------------------------------------------------------------

  @Test
  fun `gap percent is the rise from the previous close to the PM open`() {
    // KTTA of mockup/PARCOURS.md : 2.65 -> 4.05 = +52.830... -> 52.83
    val gap = StatMetrics.gapPercent(previousClose = price("2.65"), pmOpen = price("4.05"))

    assertEquals(0, gap!!.compareTo(BigDecimal("52.83")), "got ${gap.toPlainString()}")
  }

  @Test
  fun `premarket push percent is the rise from the PM open to the PM high`() {
    // KTTA : 4.05 -> 4.65 = +14.814... -> 14.81
    val push = StatMetrics.pmPushPercent(pmOpen = price("4.05"), pmHigh = price("4.65"))

    assertEquals(0, push!!.compareTo(BigDecimal("14.81")), "got ${push.toPlainString()}")
  }

  // ---------------------------------------------------------------------------
  // Session, vs the open
  // ---------------------------------------------------------------------------

  @Test
  fun `a session level above the open is a positive percentage`() {
    // KTTA : open 4.20, push at open 4.62 = +10.00
    val push = StatMetrics.percentVsOpen(open = price("4.2000"), level = price("4.6200"))

    assertEquals(0, push!!.compareTo(BigDecimal("10.00")), "got ${push.toPlainString()}")
  }

  @Test
  fun `a session level below the open is a negative percentage — the fade a short wants`() {
    // KTTA : open 4.20, LOD 3.41 = -18.809... -> -18.81
    val lod = StatMetrics.percentVsOpen(open = price("4.2000"), level = price("3.4100"))

    assertEquals(0, lod!!.compareTo(BigDecimal("-18.81")), "got ${lod.toPlainString()}")
  }

  @Test
  fun `a level equal to the open yields exactly zero`() {
    val flat = StatMetrics.percentVsOpen(open = price("2.0000"), level = price("2.0000"))

    assertEquals(0, flat!!.compareTo(BigDecimal.ZERO), "got ${flat.toPlainString()}")
  }

  // ---------------------------------------------------------------------------
  // Rounding
  // ---------------------------------------------------------------------------

  @Test
  fun `rounding is HALF_UP at the second decimal`() {
    // open 3.00, level 3.005 -> 0.005 / 3.00 * 100 = 0.16666... -> 0.17
    val push = StatMetrics.percentVsOpen(open = price("3.0000"), level = price("3.0050"))

    assertEquals(0, push!!.compareTo(BigDecimal("0.17")), "got ${push.toPlainString()}")
  }

  // ---------------------------------------------------------------------------
  // Null-safety — a stat to complete has no session percentage at all
  // ---------------------------------------------------------------------------

  @Test
  fun `a missing open or a missing level yields null, not an exception`() {
    assertNull(StatMetrics.percentVsOpen(open = null, level = price("4.6200")))
    assertNull(StatMetrics.percentVsOpen(open = price("4.2000"), level = null))
    assertNull(StatMetrics.percentVsOpen(open = null, level = null))
  }

  @Test
  fun `a non-positive base yields null rather than dividing by zero`() {
    // The DB CHECKs forbid these, but the formula is also fed by the live preview of the completion
    // panel, where the user can be mid-typing.
    assertNull(StatMetrics.percentVsOpen(open = BigDecimal.ZERO, level = price("4.6200")))
    assertNull(StatMetrics.percentVsOpen(open = price("-1"), level = price("4.6200")))
    assertNull(StatMetrics.gapPercent(previousClose = BigDecimal.ZERO, pmOpen = price("4.05")))
    assertNull(StatMetrics.pmPushPercent(pmOpen = BigDecimal.ZERO, pmHigh = price("4.65")))
  }

  // ---------------------------------------------------------------------------
  // Quantiles — the « À l'open » references (#261)
  // ---------------------------------------------------------------------------

  @Test
  fun `the median of an odd count is the middle push`() {
    val median = StatMetrics.quantile(pushes("7.1", "10.0", "33.0"), BigDecimal("0.5"))

    assertEquals(0, median!!.compareTo(BigDecimal("10.00")), "got ${median.toPlainString()}")
  }

  @Test
  fun `the median of an even count sits halfway between the two middle pushes`() {
    val median = StatMetrics.quantile(pushes("10.0", "5.17", "20.0", "7.1"), BigDecimal("0.5"))

    // Sorted 5.17, 7.1, 10.0, 20.0 -> halfway between 7.1 and 10.0 = 8.55.
    assertEquals(0, median!!.compareTo(BigDecimal("8.55")), "got ${median.toPlainString()}")
  }

  @Test
  fun `the 3rd quartile interpolates between the two nearest ranks`() {
    val q3 = StatMetrics.quantile(pushes("5.17", "7.1", "10.0", "20.0"), BigDecimal("0.75"))

    // Rank 0.75 * 3 = 2.25 -> 10.0 + 0.25 * (20.0 - 10.0) = 12.50, as PERCENTILE.INC gives.
    assertEquals(0, q3!!.compareTo(BigDecimal("12.50")), "got ${q3.toPlainString()}")
  }

  @Test
  fun `a single push is every quantile, and no push yields null`() {
    assertEquals(
      0,
      StatMetrics.quantile(pushes("9.6"), BigDecimal("0.75"))!!.compareTo(BigDecimal("9.60")),
    )
    assertNull(StatMetrics.quantile(emptyList(), BigDecimal("0.5")))
  }

  private fun pushes(vararg raw: String) = raw.map(::BigDecimal)

  private fun price(raw: String) = BigDecimal(raw)
}
