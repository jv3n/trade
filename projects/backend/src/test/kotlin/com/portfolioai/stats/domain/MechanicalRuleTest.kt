package com.portfolioai.stats.domain

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [MechanicalRule.replay] (#205) — a GUS replayed through a rule on its open, HOD and
 * EOD alone :
 * - **triggered** only when the HOD reached the entry (open + x %) ;
 * - **stopped** when the HOD reached the stop (open + y %), for the stop's loss whatever the EOD —
 *   no ordering is needed, the entry is on the way to the stop ;
 * - otherwise **covered at the EOD**, a win only strictly under the entry.
 *
 * Every example opens at $2.00 : 10 / 40 enters at 2.20 and stops at 2.80, 7 / 31 at 2.14 and 2.62.
 * No Spring / DB here.
 */
class MechanicalRuleTest {

  @Test
  fun `a HOD short of the entry is no trade`() {
    assertNull(MechanicalRule.TEN_FORTY.replay(gus(hod = "2.19", eod = "1.80")))
  }

  @Test
  fun `a HOD at the entry triggers it`() {
    assertTrue(MechanicalRule.TEN_FORTY.replay(gus(hod = "2.20", eod = "1.80")) != null)
  }

  @Test
  fun `a trade not stopped is covered at the EOD, in percent of the entry`() {
    // 2.20 → 1.76 : the short made 0.44 on 2.20.
    val trade = MechanicalRule.TEN_FORTY.replay(gus(hod = "2.50", eod = "1.76"))!!

    assertFalse(trade.stopped)
    assertEquals(BigDecimal("20.00"), trade.profitPercent)
    assertTrue(trade.isWin)
  }

  @Test
  fun `a HOD at the stop loses the stop, even when the EOD came back under the entry`() {
    // 2.20 → 2.80 : 0.60 lost on 2.20 — the EOD at 1.50 does not save a stopped trade.
    val trade = MechanicalRule.TEN_FORTY.replay(gus(hod = "2.80", eod = "1.50"))!!

    assertTrue(trade.stopped)
    assertEquals(BigDecimal("-27.27"), trade.profitPercent)
    assertFalse(trade.isWin)
  }

  @Test
  fun `a close above the entry is a loss without a stop`() {
    val trade = MechanicalRule.TEN_FORTY.replay(gus(hod = "2.50", eod = "2.31"))!!

    assertFalse(trade.stopped)
    assertEquals(BigDecimal("-5.00"), trade.profitPercent)
  }

  @Test
  fun `a close exactly at the entry is not a win`() {
    assertFalse(MechanicalRule.TEN_FORTY.replay(gus(hod = "2.50", eod = "2.20"))!!.isWin)
  }

  @Test
  fun `each rule reads its own levels — the same day can trigger one and not the other`() {
    val day = gus(hod = "2.16", eod = "1.80")

    assertNull(MechanicalRule.TEN_FORTY.replay(day))
    // 2.14 → 1.80 : 0.34 on 2.14.
    assertEquals(BigDecimal("15.89"), MechanicalRule.SEVEN_THIRTY_ONE.replay(day)!!.profitPercent)
  }

  @Test
  fun `a stat without its HOD or its EOD is not replayed`() {
    assertNull(MechanicalRule.TEN_FORTY.replay(gus(hod = null, eod = "1.80")))
    assertNull(MechanicalRule.TEN_FORTY.replay(gus(hod = "2.50", eod = null)))
  }

  private fun gus(hod: String?, eod: String?) =
    StatEntry(user = USER, tradeDate = LocalDate.of(2026, 9, 17), ticker = "KTTA").apply {
      openPrice = BigDecimal("2.00")
      hodPrice = hod?.let(::BigDecimal)
      eodPrice = eod?.let(::BigDecimal)
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
