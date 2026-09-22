package com.portfolioai.stats.application

import com.portfolioai.stats.domain.StatEntry

/**
 * Encodes a list of [StatEntry] into a RFC 4180 CSV string — the stats export.
 *
 * Format choices mirror `TradeEntryCsvEncoder` (the journal exporter) : UTF-8 with BOM so Excel
 * detects the encoding, CRLF line endings, quoting only when a value contains `,`, `"`, `\r` or
 * `\n` (inner `"` doubled), booleans as `true` / `false`, dates ISO `yyyy-MM-dd`, numbers via
 * [java.math.BigDecimal.toPlainString] (no scientific notation).
 *
 * Export only — there is no stats CSV import : a stat is born from a candidate. The file is a
 * spreadsheet-friendly copy of the sheet : the session cells carry whatever is filled, and the last
 * column whether the stat was ticked as completed. No derived percentage is emitted : gap,
 * premarket push and the session percentages are recomputed from the prices wherever they are
 * displayed.
 */
object StatEntryCsvEncoder {

  /** Export layout, order-locked : premarket block, session block, the flags, then the status. */
  val HEADERS: List<String> =
    listOf(
      "Date",
      "Pattern",
      "Ticker",
      "Previous close",
      "PM open",
      "PM high",
      "Float (M)",
      "Volume (M)",
      "Locate",
      "Notes",
      "Open",
      "Push open",
      "HOD",
      "LOD",
      "EOD",
      "SSR?",
      "<\$1 stock?",
      "Entry after 11AM?",
      "No push?",
      "Institutions <20%?",
      "Completed?",
    )

  fun encode(entries: List<StatEntry>): String {
    val sb = StringBuilder()
    sb.append('﻿') // BOM for Excel
    sb.append(HEADERS.joinToString(","))
    sb.append("\r\n")
    for (entry in entries) {
      sb.append(rowFor(entry))
      sb.append("\r\n")
    }
    return sb.toString()
  }

  private fun rowFor(e: StatEntry): String =
    listOf(
        e.tradeDate.toString(),
        e.pattern.name,
        e.ticker,
        e.previousClose.toPlainString(),
        e.pmOpen.toPlainString(),
        e.pmHigh.toPlainString(),
        e.floatMillions?.toPlainString().orEmpty(),
        e.volumeMillions?.toPlainString().orEmpty(),
        e.locatePerShare?.toPlainString().orEmpty(),
        e.note.orEmpty(),
        e.openPrice?.toPlainString().orEmpty(),
        e.pushOpenPrice?.toPlainString().orEmpty(),
        e.hodPrice?.toPlainString().orEmpty(),
        e.lodPrice?.toPlainString().orEmpty(),
        e.eodPrice?.toPlainString().orEmpty(),
        e.ssr.toString(),
        e.under1Dollar.toString(),
        e.entryAfter11am.toString(),
        e.noPush.toString(),
        e.lowInstitutions.toString(),
        e.isCompleted.toString(),
      )
      .joinToString(",") { escape(it) }

  private fun escape(value: String): String =
    if (value.any { it == ',' || it == '"' || it == '\r' || it == '\n' }) {
      "\"" + value.replace("\"", "\"\"") + "\""
    } else {
      value
    }
}
