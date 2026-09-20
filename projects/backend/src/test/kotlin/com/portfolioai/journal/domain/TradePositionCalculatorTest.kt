package com.portfolioai.journal.domain

import com.portfolioai.journal.domain.TradePositionCalculator.Leg
import com.portfolioai.journal.domain.TradePositionCalculator.PositionStatus
import java.math.BigDecimal
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * Pins the core "calculs auto" of the multi-execution journal (issue #93) — the single place that
 * turns raw entry/exit legs into the persisted aggregates. The behaviours protected here :
 *
 * - the SHORT vs BUY sign convention (a short profits when covered below the entry) ;
 * - weighted-average entry/exit across multiple legs at different prices ;
 * - realized P&L is computed on the **exited** shares only (partial closes) ;
 * - the open / partial / closed fill status ;
 * - the trade duration derived from the fill times (#192) ;
 * - inconsistent inputs (exit-without-entry, over-exit, missing direction) are rejected, not
 *   silently mis-computed.
 *
 * Scales mirror the `trade_entry` columns : average prices 4, profit 2, gain% 4.
 */
class TradePositionCalculatorTest {

  private fun entry(shares: Int, price: String) =
    Leg(ExecutionKind.ENTRY, shares, BigDecimal(price))

  private fun exit(shares: Int, price: String) = Leg(ExecutionKind.EXIT, shares, BigDecimal(price))

  /** Stamps a fill time on a leg — only the duration tests care about it. */
  private fun Leg.at(hour: Int, minute: Int) = copy(executedAt = LocalTime.of(hour, minute))

  @Test
  fun `no executions yields an empty open position`() {
    val agg = TradePositionCalculator.compute(TradeDirection.SHORT, emptyList())
    assertNull(agg.size)
    assertNull(agg.profitDollars)
    assertEquals(PositionStatus.OPEN, agg.status)
  }

  @Test
  fun `single-leg short round-trip profits when covered below the entry`() {
    val agg =
      TradePositionCalculator.compute(TradeDirection.SHORT, listOf(entry(100, "5"), exit(100, "4")))

    assertEquals(100, agg.size)
    assertEquals(BigDecimal("5.0000"), agg.avgEntry)
    assertEquals(BigDecimal("4.0000"), agg.avgExit)
    assertEquals(BigDecimal("100.00"), agg.profitDollars)
    assertEquals(BigDecimal("20.0000"), agg.gainPercent)
    assertEquals(PositionStatus.CLOSED, agg.status)
  }

  @Test
  fun `long position flips the sign — profit when sold above the entry`() {
    val agg =
      TradePositionCalculator.compute(TradeDirection.BUY, listOf(entry(100, "4"), exit(100, "5")))

    assertEquals(BigDecimal("100.00"), agg.profitDollars)
    assertEquals(PositionStatus.CLOSED, agg.status)
  }

  @Test
  fun `weighted average entry across scale-in legs`() {
    // 100 @ 6 + 100 @ 4 → avg 5 ; cover all 200 @ 4.5 (short) → (5 - 4.5) * 200 = 100.
    val agg =
      TradePositionCalculator.compute(
        TradeDirection.SHORT,
        listOf(entry(100, "6"), entry(100, "4"), exit(200, "4.5")),
      )

    assertEquals(BigDecimal("5.0000"), agg.avgEntry)
    assertEquals(200, agg.size)
    assertEquals(BigDecimal("100.00"), agg.profitDollars)
    assertEquals(PositionStatus.CLOSED, agg.status)
  }

  @Test
  fun `partial close realizes P&L on the exited shares and stays PARTIAL`() {
    val agg =
      TradePositionCalculator.compute(TradeDirection.SHORT, listOf(entry(200, "5"), exit(100, "4")))

    assertEquals(200, agg.size)
    assertEquals(BigDecimal("100.00"), agg.profitDollars) // (5 - 4) * 100 exited
    assertEquals(PositionStatus.PARTIAL, agg.status)
  }

  @Test
  fun `fully open position has no realized P&L`() {
    val agg = TradePositionCalculator.compute(TradeDirection.SHORT, listOf(entry(100, "5")))

    assertEquals(BigDecimal("5.0000"), agg.avgEntry)
    assertNull(agg.avgExit)
    assertNull(agg.profitDollars)
    assertEquals(PositionStatus.OPEN, agg.status)
  }

  @Test
  fun `exiting more shares than entered is rejected`() {
    assertThrows(IllegalArgumentException::class.java) {
      TradePositionCalculator.compute(TradeDirection.SHORT, listOf(entry(100, "5"), exit(150, "4")))
    }
  }

  @Test
  fun `executions without a direction are rejected`() {
    assertThrows(IllegalArgumentException::class.java) {
      TradePositionCalculator.compute(null, listOf(entry(100, "5")))
    }
  }

  @Test
  fun `an exit without any entry is rejected`() {
    assertThrows(IllegalArgumentException::class.java) {
      TradePositionCalculator.compute(TradeDirection.SHORT, listOf(exit(100, "4")))
    }
  }

  // ---------------------------------------------------------------------------
  // Duration (#192) — first entry fill to last exit fill.
  // ---------------------------------------------------------------------------

  @Test
  fun `duration spans the first entry fill to the last exit fill`() {
    val legs =
      listOf(
        entry(100, "5").at(9, 42),
        entry(100, "4").at(9, 50),
        exit(100, "4").at(10, 5),
        exit(100, "3").at(10, 15),
      )

    assertEquals(33L, TradePositionCalculator.duration(legs), "9h42 → 10h15")
    assertEquals(33L, TradePositionCalculator.compute(TradeDirection.SHORT, legs).durationMinutes)
  }

  @Test
  fun `an open position has no duration`() {
    assertNull(TradePositionCalculator.duration(listOf(entry(100, "5").at(9, 42))))
  }

  @Test
  fun `a half-timed position has no duration rather than a wrong one`() {
    // The entry time was typed in, the exit one wasn't : there is no span to report, and reporting
    // zero would read as a scratch on the trade page.
    val legs = listOf(entry(100, "5").at(9, 42), exit(100, "4"))
    assertNull(TradePositionCalculator.duration(legs))
  }

  @Test
  fun `fills entered out of order yield no duration rather than a negative one`() {
    val legs = listOf(entry(100, "5").at(10, 30), exit(100, "4").at(9, 45))
    assertNull(TradePositionCalculator.duration(legs))
  }

  @Test
  fun `infers SHORT when the exit is at or below the entry, BUY otherwise`() {
    assertEquals(
      TradeDirection.SHORT,
      TradePositionCalculator.inferDirection(BigDecimal("5"), BigDecimal("4")),
    )
    assertEquals(
      TradeDirection.BUY,
      TradePositionCalculator.inferDirection(BigDecimal("4"), BigDecimal("5")),
    )
    // Open position (no exit) falls back to SHORT — the journal's bread and butter.
    assertEquals(
      TradeDirection.SHORT,
      TradePositionCalculator.inferDirection(BigDecimal("4"), null),
    )
  }
}
