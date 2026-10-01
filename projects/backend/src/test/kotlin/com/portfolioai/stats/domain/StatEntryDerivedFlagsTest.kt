package com.portfolioai.stats.domain

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for the flags the app derives instead of asking (#499) — « a checkbox survives only if
 * the app cannot derive it » :
 * - [StatEntry.under1Dollar] off the open (a double top's start), where the margin floor bites ;
 *   the box it replaces was wrong on a third of the stats (SOAR at 0.40 and FBGL at 0.632 unticked)
 *   ;
 * - [StatEntry.entersAfter11am] off the retest time on a double top, entered on its retest ; the
 *   other patterns store no entry time, so there it stays the box ticked by hand.
 *
 * No Spring / DB here.
 */
class StatEntryDerivedFlagsTest {

  @Test
  fun `an open under a dollar is under a dollar, ticked or not`() {
    // MULN 10/09 of the mockup opened at 0.88.
    assertTrue(gus(open = "0.88").under1Dollar)
  }

  @Test
  fun `a dollar exactly is not under a dollar`() {
    assertFalse(gus(open = "1.00").under1Dollar)
  }

  @Test
  fun `before the open, nothing says it`() {
    assertFalse(gus(open = null).under1Dollar)
  }

  @Test
  fun `a double top reads its start, the open unless moved`() {
    assertTrue(doubleTop(start = "0.88", retestTime = null).under1Dollar)
  }

  @Test
  fun `a double top retested after 11 am was entered after 11 am`() {
    // SDEV 29/09 : the double top runs 11:03 -> 12:13, and the box was left unticked.
    assertTrue(doubleTop(retestTime = LocalTime.of(12, 13)).entersAfter11am)
  }

  @Test
  fun `a double top retested at 11 sharp counts, one retested before 11 does not`() {
    assertTrue(doubleTop(retestTime = LocalTime.of(11, 0)).entersAfter11am)
    assertFalse(doubleTop(retestTime = LocalTime.of(10, 38)).entersAfter11am)
  }

  @Test
  fun `a double top ignores the box — its retest time is what it says`() {
    val ticked = doubleTop(retestTime = LocalTime.of(10, 38)).apply { entryAfter11am = true }

    assertFalse(ticked.entersAfter11am)
  }

  @Test
  fun `a GUS stores no entry time, so it keeps the box ticked by hand`() {
    assertTrue(gus(open = "4.20").apply { entryAfter11am = true }.entersAfter11am)
    assertFalse(gus(open = "4.20").entersAfter11am)
  }

  private fun gus(open: String?) =
    StatEntry(
        user = USER,
        tradeDate = LocalDate.of(2026, 9, 17),
        ticker = "KTTA",
        previousClose = BigDecimal("2.65"),
        pmOpen = BigDecimal("4.05"),
        pmHigh = BigDecimal("4.65"),
      )
      .apply { openPrice = open?.let(::BigDecimal) }

  private fun doubleTop(start: String = "2.30", retestTime: LocalTime?) =
    gus(open = null).apply {
      pattern = Pattern.DT
      dtStartPrice = BigDecimal(start)
      dtRetestTime = retestTime
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
