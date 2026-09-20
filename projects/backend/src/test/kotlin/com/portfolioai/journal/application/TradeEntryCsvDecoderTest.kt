package com.portfolioai.journal.application

import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeDirection
import java.math.BigDecimal
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins the CSV import reconstruction. A row stays flat : the decoder rebuilds a **simple** position
 * from the aggregate columns — one ENTRY leg, plus an EXIT leg when the row was closed — and only
 * falls back to a short-biased inference when the `direction` cell is empty. The P&L / gain columns
 * are ignored on import (recomputed downstream from the executions) ; the real P&L is not, it is
 * user input.
 *
 * Since #192 the stat link is mandatory : a row without a valid `statEntryId` is a hard error.
 */
class TradeEntryCsvDecoderTest {

  private val statId: UUID = UUID.fromString("11111111-2222-3333-4444-555555555555")

  private fun csv(dataRow: List<String>): String =
    TradeEntryCsvEncoder.HEADERS.joinToString(",") + "\r\n" + dataRow.joinToString(",") + "\r\n"

  /** A data row keyed by the encoder's header order, with sensible empties. */
  private fun row(
    size: String = "",
    openPrice: String = "",
    exitPrice: String = "",
    direction: String = "",
    statEntryId: String = statId.toString(),
    realProfitDollars: String = "",
  ): List<String> =
    listOf(
      "2026-06-04", // tradeDate
      "bac", // ticker
      "", // pattern
      statEntryId,
      direction,
      size,
      openPrice,
      exitPrice,
      "999", // profitDollars — ignored on import
      "50", // gainPercent — ignored on import
      realProfitDollars,
      "", // note
      "", // errorNote
    )

  @Test
  fun `a closed row reconstructs an ENTRY + EXIT pair and infers SHORT`() {
    val result =
      TradeEntryCsvDecoder.decode(csv(row(size = "100", openPrice = "5", exitPrice = "4")))

    assertTrue(result.errors.isEmpty(), "clean row should not error")
    val req = result.rows.single()
    assertEquals("BAC", req.ticker)
    assertEquals(statId, req.statEntryId)
    assertEquals(TradeDirection.SHORT, req.direction, "exit below entry → SHORT")
    assertEquals(2, req.executions.size)
    assertEquals(ExecutionKind.ENTRY, req.executions[0].kind)
    assertEquals(100, req.executions[0].shares)
    assertEquals(0, req.executions[0].price.compareTo(BigDecimal("5")))
    assertEquals(ExecutionKind.EXIT, req.executions[1].kind)
    assertEquals(0, req.executions[1].price.compareTo(BigDecimal("4")))
  }

  @Test
  fun `an open row (no exit) reconstructs a single ENTRY leg`() {
    val result = TradeEntryCsvDecoder.decode(csv(row(size = "100", openPrice = "5")))

    val req = result.rows.single()
    assertEquals(1, req.executions.size)
    assertEquals(ExecutionKind.ENTRY, req.executions.single().kind)
    assertEquals(TradeDirection.SHORT, req.direction, "open position falls back to SHORT")
  }

  @Test
  fun `a row above its entry infers BUY`() {
    val result =
      TradeEntryCsvDecoder.decode(csv(row(size = "100", openPrice = "4", exitPrice = "5")))

    assertEquals(TradeDirection.BUY, result.rows.single().direction, "exit above entry → BUY")
  }

  @Test
  fun `an explicit direction column wins over the inference`() {
    // A BUY scratched for a loss (exit below entry) would read as SHORT if we only looked at the
    // prices — the exported column is authoritative.
    val result =
      TradeEntryCsvDecoder.decode(
        csv(row(size = "100", openPrice = "5", exitPrice = "4", direction = "BUY"))
      )

    assertEquals(TradeDirection.BUY, result.rows.single().direction)
  }

  @Test
  fun `the real P&L round-trips, negative values included`() {
    val result =
      TradeEntryCsvDecoder.decode(
        csv(row(size = "100", openPrice = "5", exitPrice = "4", realProfitDollars = "-12.30"))
      )

    assertEquals(
      0,
      result.rows.single().realProfitDollars!!.compareTo(BigDecimal("-12.30")),
      "a losing broker figure is a perfectly valid real P&L",
    )
  }

  @Test
  fun `a bare row with no size or price has no executions and no direction`() {
    val result = TradeEntryCsvDecoder.decode(csv(row()))

    val req = result.rows.single()
    assertTrue(req.executions.isEmpty())
    assertNull(req.direction)
  }

  @Test
  fun `a row without a stat link is rejected`() {
    val result = TradeEntryCsvDecoder.decode(csv(row(statEntryId = "")))

    assertTrue(result.rows.isEmpty(), "nothing usable comes out of a trade with no stat")
    assertEquals(2, result.errors.single().line, "the error points at the data row")
    assertTrue(result.errors.single().message.contains("statEntryId"))
  }

  @Test
  fun `a malformed stat link is rejected`() {
    val result = TradeEntryCsvDecoder.decode(csv(row(statEntryId = "not-a-uuid")))

    assertTrue(result.errors.single().message.contains("UUID"))
  }
}
