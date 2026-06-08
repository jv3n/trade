package com.portfolioai.stats.application

import com.portfolioai.stats.domain.StatEntry

/**
 * Encodes a list of [StatEntry] into a RFC 4180 CSV string — the whole-table export.
 *
 * Format choices mirror `TradeEntryCsvEncoder` (the journal exporter) : • UTF-8 with BOM (`﻿`) so
 * Excel detects the encoding. • CRLF line endings (same Excel reason). • Quoting only when a value
 * contains `,`, `"`, `\r` or `\n` ; inner `"` doubled. • Booleans rendered `true` / `false`. •
 * Dates ISO `yyyy-MM-dd`. • Numbers via [java.math.BigDecimal.toPlainString] (no scientific
 * notation).
 *
 * **Roundtrip-safe with the import.** The layout is exactly [StatEntryCsvDecoder.HEADERS] — the
 * same 14 columns the importer expects, in the same order — so a file produced here re-imports
 * as-is. The three derived columns ([StatEntry.pushPercent] / [lodPercent] / [eodPercent]) are
 * intentionally **omitted** : they are recomputed at insert time, so emitting them would only break
 * the roundtrip (the decoder validates its 14-column header verbatim) for redundant data.
 */
object StatEntryCsvEncoder {

  /** Import layout, order-locked — shared with the decoder so export ⇄ import stay in lockstep. */
  val HEADERS: List<String> = StatEntryCsvDecoder.HEADERS

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
        e.ticker,
        e.gapUpPercent.toPlainString(),
        e.floatSharesMillions.toPlainString(),
        e.institutionsPercent.toPlainString(),
        e.instOver20.toString(),
        e.under1Dollar.toString(),
        e.ssr.toString(),
        e.entryAfter11am.toString(),
        e.note.orEmpty(),
        e.openPrice.toPlainString(),
        e.highPrice.toPlainString(),
        e.lodPrice.toPlainString(),
        e.eodPrice.toPlainString(),
      )
      .joinToString(",") { escape(it) }

  /** RFC 4180 quoting — only wrap when the field contains `,`, `"`, `\r` or `\n`. */
  private fun escape(value: String): String {
    val needsQuoting = value.any { it == ',' || it == '"' || it == '\r' || it == '\n' }
    if (!needsQuoting) return value
    val escapedInner = value.replace("\"", "\"\"")
    return "\"$escapedInner\""
  }
}
