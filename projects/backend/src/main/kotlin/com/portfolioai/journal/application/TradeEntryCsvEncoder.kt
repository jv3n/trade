package com.portfolioai.journal.application

import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeExecution
import com.portfolioai.journal.domain.TradePositionCalculator
import java.math.BigDecimal

/**
 * Encodes a list of [TradeEntry] into a RFC 4180 CSV string.
 *
 * **Export only** (#196) — there is no CSV import for the journal : a trade is born from a stat and
 * its executions are typed on its page, so this file is a spreadsheet-friendly copy, not an
 * exchange format. That frees the layout from the roundtrip constraint : it can carry the derived
 * figures (retained P&L, duration) the importer would have had to ignore.
 *
 * Format choices : • UTF-8 with BOM (`﻿`) — Excel needs it to recognise the encoding when opening a
 * file. • CRLF line endings — same Excel reason. • Quoting — values are wrapped in `"` and inner
 * `"` doubled, only when needed (the field contains `,`, `"`, `\r` or `\n`). Empty cells are
 * rendered as nothing, not `"null"`. • Dates — ISO `yyyy-MM-dd` via [java.time.LocalDate.toString].
 * • Numbers — [BigDecimal.toPlainString] to avoid scientific notation (`1E+2` would confuse Excel).
 *
 * One row per trade. The executions don't fit a flat column each (a position has as many as the
 * broker filled), so they travel packed in a single `executions` cell — one
 * `time|kind|shares|price` group per fill, separated by ` ; `, in `seq` order. The three P&L
 * figures are all there : computed, real and the retained one that reaches the account. `id` /
 * `createdAt` / `updatedAt` are server-side and excluded ; `statEntryId` is not, because a trade
 * without its stat is meaningless since #192.
 */
object TradeEntryCsvEncoder {

  /** Separator between two packed executions — spaced so Excel doesn't glue them together. */
  private const val EXECUTION_SEPARATOR = " ; "
  /** Separator between the fields of one packed execution. */
  private const val EXECUTION_FIELD_SEPARATOR = "|"

  val HEADERS: List<String> =
    listOf(
      "tradeDate",
      "ticker",
      "pattern",
      "statEntryId",
      "direction",
      "size",
      "avgEntryPrice",
      "avgExitPrice",
      "executions",
      "durationMinutes",
      "computedProfitDollars",
      "realProfitDollars",
      "retainedProfitDollars",
      "retainedGainPercent",
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
        packExecutions(e.executions),
        TradePositionCalculator.duration(e.executions.map { it.toLeg() })?.toString().orEmpty(),
        e.profitDollars?.toPlainString().orEmpty(),
        e.realProfitDollars?.toPlainString().orEmpty(),
        e.retainedProfit?.toPlainString().orEmpty(),
        e.retainedGainPercent?.toPlainString().orEmpty(),
        e.note.orEmpty(),
        e.errorNote.orEmpty(),
      )
      .joinToString(",") { escape(it) }

  /** `09:41|ENTRY|200|4.4100 ; 10:48|EXIT|200|3.7800` — an untimed fill leaves its time empty. */
  private fun packExecutions(executions: List<TradeExecution>): String =
    executions.sortedBy { it.seq }.joinToString(EXECUTION_SEPARATOR) { pack(it) }

  private fun pack(execution: TradeExecution): String =
    listOf(
        execution.executedAt?.toString().orEmpty(),
        execution.kind.name,
        execution.shares.toString(),
        execution.price.toPlainString(),
      )
      .joinToString(EXECUTION_FIELD_SEPARATOR)

  /** RFC 4180 quoting — only wrap when the field contains `,`, `"`, `\r` or `\n`. */
  private fun escape(value: String): String {
    val needsQuoting = value.any { it == ',' || it == '"' || it == '\r' || it == '\n' }
    if (!needsQuoting) return value
    val escapedInner = value.replace("\"", "\"\"")
    return "\"$escapedInner\""
  }
}
