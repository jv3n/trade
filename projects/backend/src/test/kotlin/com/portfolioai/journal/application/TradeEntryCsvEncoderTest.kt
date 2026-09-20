package com.portfolioai.journal.application

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradePositionCalculator
import com.portfolioai.shared.Pattern
import com.portfolioai.shared.TradeDirection
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins the journal CSV export (#196) — the only CSV leg the journal has left, since a trade is born
 * from a stat and can no longer be imported.
 *
 * What matters in a file that lands in Excel :
 *
 * - the **Excel preamble** — BOM and CRLF, or accents and line breaks come out mangled ;
 * - the **executions**, which have no flat column of their own : they are packed in one cell, in
 *   fill order, and an untimed fill still holds its place ;
 * - the **three P&L figures** side by side, the retained one being the broker's when it is there ;
 * - **RFC 4180 quoting** on the free-text columns — a post-mortem full of commas is the normal
 *   case, not the edge case.
 */
class TradeEntryCsvEncoderTest {

  @Test
  fun `the file opens cleanly in Excel — BOM, CRLF and the header row`() {
    val csv = TradeEntryCsvEncoder.encode(emptyList())

    assertTrue(csv.startsWith("﻿"), "Excel needs the BOM to detect UTF-8")
    assertEquals("﻿" + TradeEntryCsvEncoder.HEADERS.joinToString(",") + "\r\n", csv)
  }

  @Test
  fun `the executions travel packed in one cell, in fill order`() {
    val csv = TradeEntryCsvEncoder.encode(listOf(ktta()))

    assertEquals(
      "09:41|ENTRY|200|4.4100 ; 09:52|ENTRY|150|4.6200 ; 13:15|EXIT|350|3.6600",
      csv.dataRow()[executionsColumn()],
    )
  }

  @Test
  fun `a fill with no time keeps its place in the packed cell`() {
    val trade = ktta()
    trade.executions.first().executedAt = null

    val packed = TradeEntryCsvEncoder.encode(listOf(trade)).dataRow()[executionsColumn()]

    assertTrue(
      packed.startsWith("|ENTRY|200|4.4100"),
      "an empty time, not a missing field : $packed",
    )
  }

  @Test
  fun `the three P&L figures are all there — the retained one being the broker's`() {
    val row = TradeEntryCsvEncoder.encode(listOf(ktta())).dataRow()

    assertEquals("294.00", row[columnOf("computedProfitDollars")])
    assertEquals("291.85", row[columnOf("realProfitDollars")])
    assertEquals("291.85", row[columnOf("retainedProfitDollars")], "real wins over computed")
  }

  @Test
  fun `the duration is derived from the fill times`() {
    val row = TradeEntryCsvEncoder.encode(listOf(ktta())).dataRow()

    assertEquals("214", row[columnOf("durationMinutes")], "09:41 → 13:15")
  }

  @Test
  fun `an open position leaves its P&L and duration cells empty, not null`() {
    val trade = ktta()
    trade.executions.removeAt(2) // no exit anymore
    trade.profitDollars = null
    trade.realProfitDollars = null
    trade.gainPercent = null

    val row = TradeEntryCsvEncoder.encode(listOf(trade)).dataRow()

    assertEquals("", row[columnOf("computedProfitDollars")])
    assertEquals("", row[columnOf("retainedProfitDollars")])
    assertEquals("", row[columnOf("durationMinutes")], "an open position has no duration yet")
  }

  @Test
  fun `a post-mortem with commas and quotes stays one cell`() {
    val trade = ktta()
    trade.note = """Rejected under 4,65 — the "premarket high""""

    val line = TradeEntryCsvEncoder.encode(listOf(trade)).csvLines()[1]

    assertTrue(
      line.contains("\"Rejected under 4,65 — the \"\"premarket high\"\"\""),
      "commas keep the cell together and inner quotes are doubled : $line",
    )
  }

  // ---------------------------------------------------------------------------

  /** The KTTA short of the mockup : two shorts at 09:41 / 09:52, one cover at 13:15. */
  private fun ktta(): TradeEntry {
    val trade =
      TradeEntry(
        user = User(email = "t@test.local", displayName = "T", provider = "test", role = Role.USER),
        statEntryId = UUID.randomUUID(),
        tradeDate = LocalDate.of(2026, 9, 17),
        ticker = "KTTA",
        pattern = Pattern.GUS,
        direction = TradeDirection.SHORT,
      )
    trade.replaceExecutions(
      listOf(
        leg(ExecutionKind.ENTRY, 200, "4.4100", LocalTime.of(9, 41)),
        leg(ExecutionKind.ENTRY, 150, "4.6200", LocalTime.of(9, 52)),
        leg(ExecutionKind.EXIT, 350, "3.6600", LocalTime.of(13, 15)),
      )
    )
    trade.size = 350
    trade.openPrice = BigDecimal("4.5000")
    trade.exitPrice = BigDecimal("3.6600")
    trade.profitDollars = BigDecimal("294.00")
    trade.gainPercent = BigDecimal("18.6667")
    trade.realProfitDollars = BigDecimal("291.85")
    return trade
  }

  private fun leg(kind: ExecutionKind, shares: Int, price: String, at: LocalTime) =
    TradePositionCalculator.Leg(kind, shares, BigDecimal(price), at)

  private fun columnOf(header: String) = TradeEntryCsvEncoder.HEADERS.indexOf(header)

  private fun executionsColumn() = columnOf("executions")

  /** The single data row, split on the commas that sit outside a quoted cell. */
  private fun String.dataRow(): List<String> = csvLines()[1].splitCsv()

  private fun String.csvLines(): List<String> = trimEnd('\r', '\n').split("\r\n")

  private fun String.splitCsv(): List<String> {
    val cells = mutableListOf<String>()
    val current = StringBuilder()
    var quoted = false
    for (c in this) {
      when {
        c == '"' -> quoted = !quoted
        c == ',' && !quoted -> {
          cells.add(current.toString())
          current.clear()
        }
        else -> current.append(c)
      }
    }
    cells.add(current.toString())
    return cells
  }
}
