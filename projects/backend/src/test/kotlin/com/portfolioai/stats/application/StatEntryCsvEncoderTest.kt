package com.portfolioai.stats.application

import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatEntryCsvEncoder] — the whole-table CSV export. Pins the format contract the
 * frontend download relies on : the BOM + CRLF Excel affordances, the **roundtrip-safe 14-column
 * layout** (identical to the importer, computed percentages omitted), `toPlainString` numbers, and
 * RFC 4180 quoting of free-text notes. No Spring / DB here — the encoder is pure.
 */
class StatEntryCsvEncoderTest {

  @Test
  fun `header is exactly the import layout — roundtrip-safe, no computed columns`() {
    val csv = StatEntryCsvEncoder.encode(emptyList())
    val header = csv.removePrefix("﻿").substringBefore("\r\n")

    assertEquals(StatEntryCsvDecoder.HEADERS, header.split(","))
  }

  @Test
  fun `output starts with a BOM and uses CRLF line endings for Excel`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry()))

    assertTrue(csv.startsWith("﻿"), "missing BOM")
    assertTrue(csv.contains("\r\n"), "missing CRLF")
  }

  @Test
  fun `a row carries the 14 import columns, numbers in plain form, computed percentages omitted`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry()))
    val row = csv.removePrefix("﻿").split("\r\n")[1]

    assertEquals(
      "2026-06-04,BAC,52.00,12.50,8.30,false,false,true,false,Clean GUS fade," +
        "4.2000,4.4500,3.0500,3.1000",
      row,
    )
  }

  @Test
  fun `a note containing a comma is wrapped in quotes`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(note = "gap 50%, clean fade")))
    val row = csv.removePrefix("﻿").split("\r\n")[1]

    assertTrue(row.contains("\"gap 50%, clean fade\""), "comma note not quoted : $row")
  }

  @Test
  fun `a null note renders as an empty cell, not the literal null`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(note = null)))
    val row = csv.removePrefix("﻿").split("\r\n")[1]

    // The note sits at index 9 — must be empty, never "null".
    assertEquals("", row.split(",")[9])
  }

  /**
   * Default fixture mirrors the BAC row used across the stats specs ; override only what matters.
   */
  private fun makeEntry(note: String? = "Clean GUS fade"): StatEntry =
    StatEntry(
      tradeDate = LocalDate.parse("2026-06-04"),
      ticker = "BAC",
      gapUpPercent = BigDecimal("52.00"),
      floatSharesMillions = BigDecimal("12.50"),
      institutionsPercent = BigDecimal("8.30"),
      instOver20 = false,
      under1Dollar = false,
      ssr = true,
      entryAfter11am = false,
      note = note,
      openPrice = BigDecimal("4.2000"),
      highPrice = BigDecimal("4.4500"),
      lodPrice = BigDecimal("3.0500"),
      eodPrice = BigDecimal("3.1000"),
      pushPercent = BigDecimal("5.95"),
      lodPercent = BigDecimal("-27.38"),
      eodPercent = BigDecimal("-26.19"),
    )
}
