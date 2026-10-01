package com.portfolioai.journal.application

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradePositionCalculator
import com.portfolioai.journal.domain.TradePositionCalculator.Leg
import com.portfolioai.shared.Pattern
import com.portfolioai.shared.TradeDirection
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.data.domain.Sort

/**
 * Pins how the journal folds trades into its rows since #500 — one row per ticker and day — and how
 * it orders them. The behaviours protected here :
 *
 * - SDEV's three trades of 29/09 are **one** row : its P&L is the sum, its size the largest trade
 *   (never the sum : the old « 9 000 » was the bug), its duration the sum of the trades' ;
 * - a GUS and a discretionary stat on the same ticker and day share the row, a chip per pattern and
 *   per direction ;
 * - entry, exit and % only on a single-trade row — an average across trades is a price nothing was
 *   bought at ;
 * - the sort reads the row's own figures, empty values last whatever the direction, and the default
 *   is the latest day first.
 */
class JournalDaysTest {

  private val user = User(email = "trader@test.local", provider = "test", role = Role.USER)

  private val sdevDay = LocalDate.of(2026, 9, 29)
  private val kttaDay = LocalDate.of(2026, 9, 17)

  /** One entry and one exit of [shares], [minutes] apart from [from]. */
  private data class RoundTrip(
    val direction: TradeDirection,
    val shares: Int,
    val entry: String,
    val exit: String,
    val from: LocalTime,
    val minutes: Long,
  )

  private fun trade(
    ticker: String,
    day: LocalDate,
    fills: RoundTrip,
    pattern: Pattern = Pattern.GUS,
  ): TradeEntry {
    val legs =
      listOf(
        Leg(ExecutionKind.ENTRY, fills.shares, BigDecimal(fills.entry), fills.from),
        Leg(
          ExecutionKind.EXIT,
          fills.shares,
          BigDecimal(fills.exit),
          fills.from.plusMinutes(fills.minutes),
        ),
      )
    return TradeEntry(
        user = user,
        statEntryId = UUID.randomUUID(),
        tradeDate = day,
        ticker = ticker,
        pattern = pattern,
        direction = fills.direction,
        createdAt = Instant.now(),
      )
      .apply {
        replaceExecutions(legs)
        applyAggregates(TradePositionCalculator.compute(fills.direction, legs))
      }
  }

  private fun short(shares: Int, entry: String, exit: String, from: LocalTime, minutes: Long) =
    RoundTrip(TradeDirection.SHORT, shares, entry, exit, from, minutes)

  private fun sdev() =
    listOf(
      trade("SDEV", sdevDay, short(3000, "2.706", "2.895", LocalTime.of(11, 8), 1)),
      trade("SDEV", sdevDay, short(3000, "2.246", "2.32", LocalTime.of(10, 33), 15)),
      trade("SDEV", sdevDay, short(3000, "2.236", "2.345", LocalTime.of(11, 0), 4)),
    )

  private fun ktta() =
    listOf(
      trade("KTTA", kttaDay, short(350, "4.50", "3.66", LocalTime.of(9, 41), 214)),
      trade(
        "KTTA",
        kttaDay,
        RoundTrip(TradeDirection.BUY, 200, "3.45", "3.77", LocalTime.of(14, 20), 32),
        Pattern.DISCRETIONARY,
      ),
    )

  @Test
  fun `SDEV's three trades are one row — the P&L summed, the size the largest trade`() {
    val row = JournalDays.group(sdev()).single()

    assertEquals(3, row.tradeCount)
    assertEquals(0, row.retainedProfitDollars!!.compareTo(BigDecimal("-1116.00")))
    assertEquals(3000, row.maxSize, "the largest trade, never the 9 000 of a sum")
    assertEquals(20L, row.durationMinutes, "15 + 4 + 1 : the trades' durations added up")
    assertEquals(
      listOf(LocalTime.of(10, 33), LocalTime.of(11, 0), LocalTime.of(11, 8)),
      row.trades.map { it.executions.first().executedAt },
      "the trades in the day's order",
    )
  }

  @Test
  fun `a row of several trades has no entry, exit or percentage of its own`() {
    val row = JournalDays.group(sdev()).single()

    assertNull(row.openPrice)
    assertNull(row.exitPrice)
    assertNull(row.retainedGainPercent)
  }

  @Test
  fun `a single-trade row keeps its entry, exit and percentage`() {
    val row = JournalDays.group(sdev().take(1)).single()

    assertEquals(0, row.openPrice!!.compareTo(BigDecimal("2.706")))
    assertEquals(0, row.exitPrice!!.compareTo(BigDecimal("2.895")))
    assertEquals(0, row.retainedGainPercent!!.compareTo(BigDecimal("-6.9845")))
  }

  @Test
  fun `a GUS short and a discretionary long on one ticker and day share the row`() {
    val row = JournalDays.group(ktta()).single()

    assertEquals(listOf(Pattern.GUS, Pattern.DISCRETIONARY), row.patterns)
    assertEquals(listOf(TradeDirection.SHORT, TradeDirection.BUY), row.directions)
    assertEquals(350, row.maxSize, "the short of 350 — the long of 200 does not add to it")
    assertEquals(0, row.retainedProfitDollars!!.compareTo(BigDecimal("358.00")))
  }

  @Test
  fun `by default the latest day comes first`() {
    val rows =
      JournalDays.group(ktta() + sdev()).sortedWith(JournalDays.comparator(Sort.unsorted()))

    assertEquals(listOf("SDEV", "KTTA"), rows.map { it.ticker })
  }

  @Test
  fun `sorting on the P&L orders the days by their summed P&L`() {
    val rows =
      JournalDays.group(ktta() + sdev())
        .sortedWith(JournalDays.comparator(Sort.by(Sort.Order.asc("retainedProfitDollars"))))

    assertEquals(listOf("SDEV", "KTTA"), rows.map { it.ticker })
  }

  @Test
  fun `a row with no entry price sorts last, ascending or descending`() {
    val single = trade("BNZI", kttaDay, short(500, "2.84", "2.61", LocalTime.of(9, 50), 52))
    val days = JournalDays.group(sdev() + single)

    val asc = days.sortedWith(JournalDays.comparator(Sort.by(Sort.Order.asc("openPrice"))))
    val desc = days.sortedWith(JournalDays.comparator(Sort.by(Sort.Order.desc("openPrice"))))

    assertEquals("SDEV", asc.last().ticker)
    assertEquals("SDEV", desc.last().ticker)
  }
}
