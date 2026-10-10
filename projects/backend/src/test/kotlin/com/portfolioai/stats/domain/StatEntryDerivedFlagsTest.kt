package com.portfolioai.stats.domain

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for the flags the app derives instead of asking (#499) — « a checkbox survives only if
 * the app cannot derive it » : [StatEntry.under1Dollar] off the open (a double top's start), where
 * the margin floor bites ; the box it replaces was wrong on a third of the stats (SOAR at 0.40 and
 * FBGL at 0.632 unticked).
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
    assertTrue(doubleTop(start = "0.88").under1Dollar)
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

  private fun doubleTop(start: String) =
    gus(open = null).apply {
      pattern = Pattern.DT
      dtStartPrice = BigDecimal(start)
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
