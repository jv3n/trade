package com.portfolioai.stats.domain

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatEntry.outOfPattern] (#499) — « did not meet the criteria », never « did not
 * work ». It may only carry what the stored prices verify at the moment of the entry :
 * - a double top whose retest reached the top (a breakout — the pattern never formed) ;
 * - a GUS opened outside the sheet's ~$0.30 – $10 range ;
 * - never the gap : the app's gap is not the scanner's, BKYI would have been flagged on 24.9 % when
 *   the scanner showed 113 %.
 *
 * No Spring / DB here.
 */
class StatEntryOutOfPatternTest {

  @Test
  fun `a double top whose retest takes the top back is out of pattern`() {
    // IMNN 11/09 of the mockup : top 3.40, retest 3.46.
    val imnn = doubleTop(top = "3.40", retest = "3.46")

    assertEquals(listOf(OutOfPatternReason.RETEST_TOOK_TOP), imnn.outOfPattern)
  }

  @Test
  fun `a retest exactly at the top already counts as taking it back`() {
    assertEquals(
      listOf(OutOfPatternReason.RETEST_TOOK_TOP),
      doubleTop(top = "3.40", retest = "3.40").outOfPattern,
    )
  }

  @Test
  fun `a retest under the top is a double top`() {
    // PRSO 16/09 : top 3.80, retest 3.68.
    assertTrue(doubleTop(top = "3.80", retest = "3.68").outOfPattern.isEmpty())
  }

  @Test
  fun `a double top without its retest yet says nothing`() {
    assertTrue(doubleTop(top = "3.40", retest = null).outOfPattern.isEmpty())
  }

  @Test
  fun `a GUS opened outside the sheet's price range is out of pattern`() {
    assertEquals(listOf(OutOfPatternReason.PRICE_OUT_OF_RANGE), gus(open = "12.40").outOfPattern)
    assertEquals(listOf(OutOfPatternReason.PRICE_OUT_OF_RANGE), gus(open = "0.25").outOfPattern)
  }

  @Test
  fun `a GUS opened inside the range, bounds included, is in pattern`() {
    // MULN 10/09 opened at 0.88 : under a dollar is a margin warning, not out of the pattern.
    assertTrue(gus(open = "0.88").outOfPattern.isEmpty())
    assertTrue(gus(open = "0.30").outOfPattern.isEmpty())
    assertTrue(gus(open = "10").outOfPattern.isEmpty())
  }

  @Test
  fun `a GUS before its open, whatever its gap, says nothing`() {
    // BKYI : 24.9 % of app gap — a valid candidate the scanner showed at 113 %.
    val bkyi = gus(open = null, previousClose = "1.69", pmOpen = "2.11", pmHigh = "3.60")

    assertTrue(bkyi.outOfPattern.isEmpty())
  }

  @Test
  fun `the price range is the GUS sheet's, not applied to the other patterns`() {
    val discretionary = gus(open = "12.40").apply { pattern = Pattern.DISCRETIONARY }

    assertTrue(discretionary.outOfPattern.isEmpty())
  }

  private fun gus(
    open: String?,
    previousClose: String = "2.65",
    pmOpen: String = "4.05",
    pmHigh: String = "4.65",
  ) =
    StatEntry(
        user = USER,
        tradeDate = LocalDate.of(2026, 9, 17),
        ticker = "KTTA",
        previousClose = BigDecimal(previousClose),
        pmOpen = BigDecimal(pmOpen),
        pmHigh = BigDecimal(pmHigh),
      )
      .apply { openPrice = open?.let(::BigDecimal) }

  private fun doubleTop(top: String, retest: String?) =
    gus(open = "2.10").apply {
      pattern = Pattern.DT
      dtStartPrice = BigDecimal("2.10")
      dtTopPrice = BigDecimal(top)
      dtLowPrice = BigDecimal("2.70")
      dtRetestPrice = retest?.let(::BigDecimal)
    }

  private companion object {
    val USER =
      User(
        email = "trader@test.local",
        displayName = "trader",
        provider = "test",
        providerId = null,
        role = Role.USER,
      )
  }
}
