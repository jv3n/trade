package com.portfolioai.stats.application

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatEntryCsvEncoder] — the CSV export behind the download button.
 *
 * Pins the format contract a spreadsheet relies on : the BOM + CRLF Excel affordances, the
 * **25-column layout** (premarket block, GUS session, double top prices, flags — no derived
 * percentage), `toPlainString` numbers, `true` / `false` flags, empty cells for every absent value
 * — including the session prices of a stat still to complete and the prices of the other pattern —
 * and RFC 4180 quoting of free-text notes.
 *
 * No Spring / DB here : the encoder is pure and the entity is built in memory.
 */
class StatEntryCsvEncoderTest {

  @Test
  fun `header is exactly the export layout, with no computed column`() {
    val csv = StatEntryCsvEncoder.encode(emptyList())
    val header = csv.removePrefix("﻿").substringBefore("\r\n")

    assertEquals(StatEntryCsvEncoder.HEADERS, header.split(","))
    assertEquals(25, StatEntryCsvEncoder.HEADERS.size)
  }

  @Test
  fun `output starts with a BOM and uses CRLF line endings for Excel`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry()))

    assertTrue(csv.startsWith("﻿"), "missing BOM")
    assertTrue(csv.contains("\r\n"), "missing CRLF")
  }

  @Test
  fun `a completed stat renders the 25 columns in order, numbers in plain form`() {
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry()))

    assertEquals(
      "2026-09-17,GUS,KTTA,2.65,4.05,4.65,8.2,3.1,0.03,Push rejeté sous 4.65," +
        "4.20,4.62,4.62,3.41,3.52,,,,,false,false,false,false,false,true",
      dataRowOf(csv),
    )
  }

  @Test
  fun `a stat still to complete comes out with five empty session cells`() {
    // A stat promoted this morning : the session block is still empty at export time.
    val csv = StatEntryCsvEncoder.encode(listOf(makeEntry(completed = false)))

    assertEquals(
      "2026-09-18,GUS,SGBX,2.65,4.05,4.65,8.2,3.1,0.03,Push rejeté sous 4.65," +
        ",,,,,,,,,false,false,false,false,false,false",
      dataRowOf(csv),
    )
  }

  @Test
  fun `absent optional premarket values render as empty cells, never the literal null`() {
    val csv =
      StatEntryCsvEncoder.encode(
        listOf(makeEntry(floatMillions = null, volumeMillions = null, locatePerShare = null))
      )
    val cells = dataRowOf(csv).split(",")

    // Float / Volume / Locate sit at 6 / 7 / 8 in the layout.
    assertEquals(listOf("", "", ""), cells.subList(6, 9))
  }

  @Test
  fun `the flags render as true or false, never blank`() {
    val csv =
      StatEntryCsvEncoder.encode(
        listOf(
          makeEntry(
            ssr = true,
            under1Dollar = false,
            entryAfter11am = true,
            highInstitutions = true,
          )
        )
      )
    val cells = dataRowOf(csv).split(",")

    // SSR / < $1 / after 11am sit at 19-21, « no push » at 22 and « institutions > 20 % » at 23.
    assertEquals(listOf("true", "false", "true"), cells.subList(19, 22))
    assertEquals("true", cells[23])
  }

  @Test
  fun `a double top fills its four prices and leaves the GUS session empty`() {
    val dt =
      makeEntry(completed = false).apply {
        pattern = Pattern.DT
        dtStartPrice = BigDecimal("1.90")
        dtTopPrice = BigDecimal("2.95")
        dtLowPrice = BigDecimal("2.36")
        dtRetestPrice = BigDecimal("2.85")
      }
    val cells = dataRowOf(StatEntryCsvEncoder.encode(listOf(dt))).split(",")

    assertEquals("DT", cells[1])
    // Open / push / HOD / LOD / EOD at 10-14, then start / top / rejection low / retest at 15-18.
    assertEquals(listOf("", "", "", "", ""), cells.subList(10, 15))
    assertEquals(listOf("1.90", "2.95", "2.36", "2.85"), cells.subList(15, 19))
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

    // The note sits at index 9 — must be empty, never "null".
    assertEquals("", dataRowOf(csv).split(",")[9])
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
    locatePerShare: BigDecimal? = BigDecimal("0.03"),
    ssr: Boolean = false,
    under1Dollar: Boolean = false,
    entryAfter11am: Boolean = false,
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
      locatePerShare = locatePerShare,
      note = note,
      openPrice = if (completed) BigDecimal("4.20") else null,
      pushOpenPrice = if (completed) BigDecimal("4.62") else null,
      completedAt = if (completed) Instant.parse("2026-09-17T20:05:00Z") else null,
      hodPrice = if (completed) BigDecimal("4.62") else null,
      lodPrice = if (completed) BigDecimal("3.41") else null,
      eodPrice = if (completed) BigDecimal("3.52") else null,
      ssr = ssr,
      under1Dollar = under1Dollar,
      entryAfter11am = entryAfter11am,
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
