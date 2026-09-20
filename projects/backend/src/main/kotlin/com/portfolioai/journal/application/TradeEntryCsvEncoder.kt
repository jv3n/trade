package com.portfolioai.journal.application

import com.portfolioai.journal.domain.TradeEntry
import java.math.BigDecimal

/**
 * Encodes a list of [TradeEntry] into a RFC 4180 CSV string.
 *
 * Format choices : • UTF-8 with BOM (`﻿`) — Excel needs it to recognise the encoding when opening a
 * file. • CRLF line endings — same Excel reason. • Quoting — values are wrapped in `"` and inner
 * `"` doubled, only when needed (the field contains `,`, `"`, `\r` or `\n`). Empty cells are
 * rendered as nothing, not `"null"`. • Dates — ISO `yyyy-MM-dd` via [java.time.LocalDate.toString].
 * • Numbers — [BigDecimal.toPlainString] to avoid scientific notation (`1E+2` would confuse Excel
 * and break the roundtrip with the importer).
 *
 * The roundtrip-safe contract is : importing a CSV produced here must reconstruct the same trade.
 * One row per trade, flat : the executions are still collapsed into `size` / `openPrice` /
 * `exitPrice` (a per-execution layout is issue #196). `id` / `createdAt` / `updatedAt` are
 * server-side and excluded ; `statEntryId` is not, because a trade without its stat is meaningless
 * since #192.
 */
object TradeEntryCsvEncoder {

  /** Public so [TradeEntryCsvDecoder] reads the same column order without duplicating it. */
  val HEADERS: List<String> =
    listOf(
      "tradeDate",
      "ticker",
      "pattern",
      "statEntryId",
      "direction",
      "size",
      "openPrice",
      "exitPrice",
      "profitDollars",
      "gainPercent",
      "realProfitDollars",
      "note",
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
        e.pattern.name,
        e.statEntryId.toString(),
        e.direction?.name.orEmpty(),
        e.size?.toString().orEmpty(),
        e.openPrice?.toPlainString().orEmpty(),
        e.exitPrice?.toPlainString().orEmpty(),
        e.profitDollars?.toPlainString().orEmpty(),
        e.gainPercent?.toPlainString().orEmpty(),
        e.realProfitDollars?.toPlainString().orEmpty(),
        e.note.orEmpty(),
        e.errorNote.orEmpty(),
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
