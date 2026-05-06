package com.portfolioai.earnings.domain

import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Tests on the surprise % derivation. The chip colour the user sees on the dossier (green beat /
 * red miss / grey inline) is driven by the sign and magnitude of this percent — wrong rounding or a
 * silent null when actual or estimate is missing would mislead. We pin the boundary cases so a
 * refactor doesn't drift the number.
 *
 * The rule is `(actual − estimate) / |estimate| × 100` rounded to 2 dp, with `null` returned when
 * either input is missing or the estimate is zero (would divide by zero — happens in practice for
 * symbols with very small EPS that round to zero).
 */
class EarningsSnapshotTest {

  @Test
  fun `positive surprise rounds to two decimals`() {
    // estimate 1.20, actual 1.31 → (0.11 / 1.20) × 100 = 9.1666… → 9.17
    val pct = computeSurprisePercent(estimate = BigDecimal("1.20"), actual = BigDecimal("1.31"))
    assertEquals(BigDecimal("9.17"), pct)
  }

  @Test
  fun `negative surprise keeps the sign`() {
    // estimate 2.00, actual 1.85 → (-0.15 / 2.00) × 100 = -7.5 → -7.50
    val pct = computeSurprisePercent(estimate = BigDecimal("2.00"), actual = BigDecimal("1.85"))
    assertEquals(BigDecimal("-7.50"), pct)
  }

  @Test
  fun `inline result is exactly zero`() {
    // Pin the boundary : a perfect-print quarter shouldn't show up as a tiny non-zero from
    // floating-point drift. The helper uses BigDecimal end-to-end, this should hold.
    val pct = computeSurprisePercent(estimate = BigDecimal("1.50"), actual = BigDecimal("1.50"))
    assertEquals(BigDecimal("0.00"), pct)
  }

  @Test
  fun `null estimate yields null surprise`() {
    val pct = computeSurprisePercent(estimate = null, actual = BigDecimal("1.50"))
    assertNull(pct)
  }

  @Test
  fun `null actual yields null surprise`() {
    val pct = computeSurprisePercent(estimate = BigDecimal("1.50"), actual = null)
    assertNull(pct)
  }

  @Test
  fun `zero estimate falls to null instead of dividing by zero`() {
    // Defensive : a zero estimate would crash with ArithmeticException. We'd rather hide the
    // surprise % than blow up — the front renders the row without a chip.
    val pct = computeSurprisePercent(estimate = BigDecimal.ZERO, actual = BigDecimal("0.05"))
    assertNull(pct)
  }

  @Test
  fun `negative estimate uses absolute value in denominator so the sign stays intuitive`() {
    // A loss-making quarter (estimate -0.50, actual -0.35) : the company beat by $0.15 →
    // surprise = (-0.35 - -0.50) / |-0.50| × 100 = 30.00. Without `abs()` the sign would flip.
    val pct = computeSurprisePercent(estimate = BigDecimal("-0.50"), actual = BigDecimal("-0.35"))
    assertEquals(BigDecimal("30.00"), pct)
  }
}
