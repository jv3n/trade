package com.portfolioai.journal.application

import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeDirection
import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins the CSV import reconstruction after the multi-execution pivot (issue #93). The CSV layout is
 * frozen on the legacy flat columns ; the decoder rebuilds a **simple** position from them — one
 * ENTRY leg, plus an EXIT leg when the row was closed — and infers the direction short-biased. The
 * P&L / gain columns are ignored on import (recomputed downstream from the executions).
 */
class TradeEntryCsvDecoderTest {

  private fun csv(dataRow: List<String>): String =
    TradeEntryCsvEncoder.HEADERS.joinToString(",") + "\r\n" + dataRow.joinToString(",") + "\r\n"

  /** A 19-cell data row keyed by the encoder's header order, with sensible empties. */
  private fun row(size: String = "", openPrice: String = "", exitPrice: String = ""): List<String> =
    listOf(
      "2026-06-04", // tradeDate
      "bac", // ticker
      "", // play
      "", // pattern
      size,
      openPrice,
      exitPrice,
      "999", // profitDollars — ignored on import
      "50", // gainPercent — ignored on import
      "", // note
      "",
      "",
      "",
      "",
      "", // 5 prep booleans
      "", // openSide
      "", // shortOnResistance
      "", // exitStrategy
      "", // errorNote
    )

  @Test
  fun `a closed row reconstructs an ENTRY + EXIT pair and infers SHORT`() {
    val result =
      TradeEntryCsvDecoder.decode(csv(row(size = "100", openPrice = "5", exitPrice = "4")))

    assertTrue(result.errors.isEmpty(), "clean row should not error")
    val req = result.rows.single()
    assertEquals("BAC", req.ticker)
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
  fun `a bare row with no size or price has no executions and no direction`() {
    val result = TradeEntryCsvDecoder.decode(csv(row()))

    val req = result.rows.single()
    assertTrue(req.executions.isEmpty())
    assertNull(req.direction)
  }
}
