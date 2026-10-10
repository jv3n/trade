package com.portfolioai.stats.application

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatEntryCsvEncoder] — the CSV export behind the download button.
 *
 * Pins the format contract a spreadsheet relies on : the BOM + CRLF Excel affordances, the
 * **27-column layout** (premarket block, GUS session, double top prices and times, flags — no
 * derived percentage), `toPlainString` numbers, `true` / `false` flags, empty cells for every
 * absent value — including the session prices of a stat still to complete and the prices of the
 * other pattern — and RFC 4180 quoting of free-text notes.
 *
 * No Spring / DB here : the encoder is pure and the entity is built in memory.
 */
class StatEntryCsvEncoderTest {

  @Test
  fun `header is exactly the export layout, with no computed column`() {
    val csv = StatEntryCsvEncoder.encode(emptyList())
    val header = csv.removePrefix("﻿").substringBefore("\r\n")

    assertEquals(StatEntryCsvEncoder.HEADERS, header.split(","))
    assertEquals(27, StatEntryCsvEncoder.HEADERS.size)
  }

  @Test
  fun `output starts with a BOM and uses CRLF line endings for Excel`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry()))

    assertTrue(csv.startsWith("﻿"), "missing BOM")
    assertTrue(csv.contains("\r\n"), "missing CRLF")
  }

  @Test
  fun `a completed stat renders the 27 columns in order, numbers in plain form`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry()))

    assertEquals(
      "2026-09-17,GUS,KTTA,2.65,4.05,4.65,8.2,3.1,Push rejeté sous 4.65," +
        "4.20,4.62,4.62,3.41,3.52,,,,,,,,,false,false,false,false,true",
      dataRowOf(csv),
    )
  }

  @Test
  fun `a stat still to complete comes out with five empty session cells`() {
    // A stat promoted this morning : the session block is still empty at export time.
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(completed = false)))

    assertEquals(
      "2026-09-18,GUS,SGBX,2.65,4.05,4.65,8.2,3.1,Push rejeté sous 4.65," +
        ",,,,,,,,,,,,,false,false,false,false,false",
      dataRowOf(csv),
    )
  }

  @Test
  fun `absent optional premarket values render as empty cells, never the literal null`() {
    val csv =
      StatEntryCsvEncoder.encode(listOf(makeEntry(floatMillions = null, volumeMillions = null)))
    val cells = dataRowOf(csv).split(",")

    // Float / Volume sit at 6 / 7 in the layout.
    assertEquals(listOf("", ""), cells.subList(6, 8))
  }

  @Test
  fun `the flags render as true or false, never blank`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(ssr = true, highInstitutions = true)))
    val cells = dataRowOf(csv).split(",")

    // SSR / < $1 / no push sit at 22-24 and « institutions > 20 % » at 25.
    assertEquals(listOf("true", "false", "false"), cells.subList(22, 25))
    assertEquals("true", cells[25])
  }

  @Test
  fun `the derived flags are exported as derived — under a dollar off the open (#499)`() {
    // MULN 10/09 of the mockup opened at 0.88 : no box any more, the price says it.
    val muln = makeEntry().apply { openPrice = BigDecimal("0.88") }

    val cells = dataRowOf(StatEntryCsvEncoder.encode(listOf(muln))).split(",")

    assertEquals("true", cells[23])
  }

  @Test
  fun `a double top fills its four prices and times and leaves the premarket and session empty`() {
    val dt =
      makeEntry(completed = false).apply {
        pattern = Pattern.DT
        previousClose = null
        pmOpen = null
        pmHigh = null
        dtStartPrice = BigDecimal("1.90")
        dtTopPrice = BigDecimal("2.95")
        dtLowPrice = BigDecimal("2.36")
        dtRetestPrice = BigDecimal("2.85")
        dtStartTime = LocalTime.of(10, 2)
        dtTopTime = LocalTime.of(10, 14)
        dtLowTime = LocalTime.of(10, 21)
        dtRetestTime = LocalTime.of(10, 38)
      }
    val cells = dataRowOf(StatEntryCsvEncoder.encode(listOf(dt))).split(",")

    assertEquals("DT", cells[1])
    // No premarket on a double top (#649) : previous close / PM open / PM high at 3-5.
    assertEquals(listOf("", "", ""), cells.subList(3, 6))
    // Open / push / HOD / LOD / EOD at 9-13, then start / top / rejection low / retest at 14-17.
    assertEquals(listOf("", "", "", "", ""), cells.subList(9, 14))
    assertEquals(listOf("1.90", "2.95", "2.36", "2.85"), cells.subList(14, 18))
    // Their times, to the minute, at 18-21 (#469).
    assertEquals(listOf("10:02", "10:14", "10:21", "10:38"), cells.subList(18, 22))
  }

  @Test
  fun `a note containing a comma is wrapped in quotes`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(note = "Résistance 4,65 — pas de news")))

    assertTrue(
      dataRowOf(csv).contains("\"Résistance 4,65 — pas de news\""),
      "comma note not quoted : ${dataRowOf(csv)}",
    )
  }

  @Test
  fun `a null note renders as an empty cell, not the literal null`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(note = null)))

    // The note sits at index 8 — must be empty, never "null".
    assertEquals("", dataRowOf(csv).split(",")[8])
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun dataRowOf(csv: String) = csv.removePrefix("﻿").split("\r\n")[1]

  /**
   * KTTA on 09/17 — the reference row of `mockup/PARCOURS.md`. [completed] swaps it for the SGBX
   * row of 09/18, whose session block is still empty ; every other test overrides just the cell it
   * is about.
   */
  private fun makeEntry(
    completed: Boolean = true,
    note: String? = "Push rejeté sous 4.65",
    floatMillions: BigDecimal? = BigDecimal("8.2"),
    volumeMillions: BigDecimal? = BigDecimal("3.1"),
    ssr: Boolean = false,
    highInstitutions: Boolean = false,
  ): StatEntry =
    StatEntry(
      user = owner,
      tradeDate = if (completed) LocalDate.of(2026, 9, 17) else LocalDate.of(2026, 9, 18),
      pattern = Pattern.GUS,
      ticker = if (completed) "KTTA" else "SGBX",
      previousClose = BigDecimal("2.65"),
      pmOpen = BigDecimal("4.05"),
      pmHigh = BigDecimal("4.65"),
      floatMillions = floatMillions,
      volumeMillions = volumeMillions,
      note = note,
      openPrice = if (completed) BigDecimal("4.20") else null,
      pushOpenPrice = if (completed) BigDecimal("4.62") else null,
      completedAt = if (completed) Instant.parse("2026-09-17T20:05:00Z") else null,
      hodPrice = if (completed) BigDecimal("4.62") else null,
      lodPrice = if (completed) BigDecimal("3.41") else null,
      eodPrice = if (completed) BigDecimal("3.52") else null,
      ssr = ssr,
      highInstitutions = highInstitutions,
    )

  private val owner =
    User(
      email = "trader@test.local",
      displayName = "Trader",
      provider = "test",
      providerId = null,
      role = Role.USER,
    )
}
