package com.portfolioai.stats.application

import java.math.BigDecimal
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatEntryCsvDecoder] — pure parsing, no Spring / DB.
 *
 * Pins the header contract (human-readable labels, verbatim), the typed-cell mapping, the
 * error-accumulation behaviour (one [com.portfolioai.stats.application.dto.ImportError] per bad
 * row, good rows still parsed) and the BOM / line-ending tolerance. The decoder does NOT compute
 * the percentage columns — that is [com.portfolioai.stats.domain.StatMetrics]'s job, covered
 * separately.
 */
class StatEntryCsvDecoderTest {

  private val header = StatEntryCsvDecoder.HEADERS.joinToString(",")

  @Test
  fun `decodes a clean row into a typed request`() {
    val csv =
      header +
        "\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,Clean GUS fade,4.2000,4.4500,3.0500,3.1000"

    val result = StatEntryCsvDecoder.decode(csv)

    assertTrue(result.errors.isEmpty(), "expected no errors, got ${result.errors}")
    assertEquals(1, result.rows.size)
    val row = result.rows.first()
    assertEquals(LocalDate.of(2026, 6, 4), row.tradeDate)
    assertEquals("BAC", row.ticker)
    assertEquals(0, row.gapUpPercent.compareTo(BigDecimal("52.0")))
    assertEquals(0, row.floatSharesMillions.compareTo(BigDecimal("12.5")))
    assertEquals(0, row.institutionsPercent.compareTo(BigDecimal("8.3")))
    assertEquals(false, row.instOver20)
    assertEquals("Clean GUS fade", row.note)
    assertEquals(0, row.openPrice.compareTo(BigDecimal("4.2000")))
    assertEquals(0, row.eodPrice.compareTo(BigDecimal("3.1000")))
  }

  @Test
  fun `lowercases-then-uppercases the ticker and treats blank notes as null`() {
    val csv =
      header + "\n2026-06-04,bac,52.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000"

    val row = StatEntryCsvDecoder.decode(csv).rows.single()

    assertEquals("BAC", row.ticker, "ticker must be normalised to upper-case")
    assertEquals(null, row.note, "an empty Notes cell maps to null")
  }

  @Test
  fun `keeps a quoted note containing a comma intact`() {
    val csv =
      header +
        "\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,\"Late entry, no edge\",4.2000,4.4500,3.0500,3.1000"

    val row = StatEntryCsvDecoder.decode(csv).rows.single()
    assertEquals("Late entry, no edge", row.note)
  }

  @Test
  fun `rejects a header that does not match the expected layout`() {
    val result = StatEntryCsvDecoder.decode("Date,Ticker,Wrong\n2026-06-04,BAC,1")

    assertTrue(result.rows.isEmpty())
    assertEquals(1, result.errors.size)
    assertEquals(1, result.errors.first().line, "header error is reported on line 1")
  }

  @Test
  fun `accumulates a per-row error and still parses the good rows`() {
    val csv =
      header +
        "\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000" + // ok
        "\nnot-a-date,BBIG,38.0,45.2,4.1,false,false,true,false,,2.1500,2.3000,1.9000,2.0500" + // bad date
        "\n2026-06-02,GBOX,61.0,8.7,22.4,true,false,false,false,,3.5000,3.8000,3.2000,3.4000" // ok

    val result = StatEntryCsvDecoder.decode(csv)

    assertEquals(2, result.rows.size, "the two valid rows are parsed")
    assertEquals(1, result.errors.size)
    assertEquals(3, result.errors.first().line, "the bad row is the 2nd data row -> file line 3")
    assertTrue(result.errors.first().message.contains("Date"), "error names the offending field")
  }

  @Test
  fun `rejects a non-boolean flag cell`() {
    val csv =
      header + "\n2026-06-04,BAC,52.0,12.5,8.3,maybe,false,false,false,,4.2000,4.4500,3.0500,3.1000"

    val result = StatEntryCsvDecoder.decode(csv)
    assertEquals(0, result.rows.size)
    assertEquals(1, result.errors.size)
    assertTrue(result.errors.first().message.contains(">20% Inst?"))
  }

  @Test
  fun `rejects a non-positive price`() {
    val csv =
      header + "\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,,0,4.4500,3.0500,3.1000"

    val result = StatEntryCsvDecoder.decode(csv)
    assertEquals(0, result.rows.size)
    assertTrue(result.errors.first().message.contains("Open"))
  }

  @Test
  fun `tolerates a UTF-8 BOM and CRLF line endings`() {
    val csv =
      "﻿" +
        header +
        "\r\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000\r\n"

    val result = StatEntryCsvDecoder.decode(csv)
    assertTrue(result.errors.isEmpty(), "BOM + CRLF must not break the header match")
    assertEquals(1, result.rows.size)
  }
}
