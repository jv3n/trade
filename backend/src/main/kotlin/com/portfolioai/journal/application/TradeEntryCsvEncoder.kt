package com.portfolioai.journal.application

import com.portfolioai.journal.domain.TradeEntry
import java.math.BigDecimal

/**
 * Encodes a list of [TradeEntry] into a RFC 4180 CSV string.
 *
 * Format choices : • UTF-8 with BOM (`﻿`) — Excel needs it to recognise the encoding when opening a
 * file. • CRLF line endings — same Excel reason. • Quoting — values are wrapped in `"` and inner
 * `"` doubled, only when needed (the field contains `,`, `"`, `\r` or `\n`). Empty cells are
 * rendered as nothing, not `"null"`. • Booleans — `true` / `false` (lowercase), empty when null. •
 * Dates — ISO `yyyy-MM-dd` via [java.time.LocalDate.toString]). • Numbers —
 * [BigDecimal.toPlainString] to avoid scientific notation (`1E+2` would confuse Excel and break the
 * roundtrip with the future importer).
 *
 * **Column order matches the domain model field order**. The roundtrip-safe contract is : importing
 * a CSV produced here must reconstruct the same trade. The 19 columns cover every input field of
 * [TradeEntry] (`id` / `createdAt` / `updatedAt` are server-side and excluded).
 */
object TradeEntryCsvEncoder {

  /** Public so [TradeEntryCsvDecoder] reads the same column order without duplicating it. */
  val HEADERS: List<String> =
    listOf(
      "tradeDate",
      "ticker",
      "play",
      "pattern",
      "size",
      "openPrice",
      "exitPrice",
      "profitDollars",
      "gainPercent",
      "note",
      "pre935To10h",
      "preGapUp50",
      "prePrice1To10",
      "preFloat3To50m",
      "preWaitPush",
      "openSide",
      "shortOnResistance",
      "exitStrategy",
      "errorNote",
    )

  fun encode(entries: List<TradeEntry>): String {
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

  private fun rowFor(e: TradeEntry): String =
    listOf(
        e.tradeDate.toString(),
        e.ticker,
        e.play.name,
        e.pattern.name,
        e.size.toString(),
        e.openPrice.toPlainString(),
        e.exitPrice?.toPlainString().orEmpty(),
        e.profitDollars?.toPlainString().orEmpty(),
        e.gainPercent?.toPlainString().orEmpty(),
        e.note.orEmpty(),
        formatBoolean(e.pre935To10h),
        formatBoolean(e.preGapUp50),
        formatBoolean(e.prePrice1To10),
        formatBoolean(e.preFloat3To50m),
        formatBoolean(e.preWaitPush),
        e.openSide?.name.orEmpty(),
        formatBoolean(e.shortOnResistance),
        e.exitStrategy?.name.orEmpty(),
        e.errorNote.orEmpty(),
      )
      .joinToString(",") { escape(it) }

  private fun formatBoolean(b: Boolean?): String = b?.toString().orEmpty()

  /** RFC 4180 quoting — only wrap when the field contains `,`, `"`, `\r` or `\n`. */
  private fun escape(value: String): String {
    val needsQuoting = value.any { it == ',' || it == '"' || it == '\r' || it == '\n' }
    if (!needsQuoting) return value
    val escapedInner = value.replace("\"", "\"\"")
    return "\"$escapedInner\""
  }
}
