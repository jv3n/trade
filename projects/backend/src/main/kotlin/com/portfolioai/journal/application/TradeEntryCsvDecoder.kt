package com.portfolioai.journal.application

import com.portfolioai.journal.application.dto.ExecutionRequest
import com.portfolioai.journal.application.dto.ImportError
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeExitStrategy
import com.portfolioai.journal.domain.TradeOpenSide
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import com.portfolioai.journal.domain.TradePositionCalculator
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Parses a CSV string produced by [TradeEntryCsvEncoder] (or hand-edited from a previous export)
 * into a list of [TradeEntryRequest]. The format is RFC 4180-ish : • UTF-8, optional BOM at file
 * start (skipped silently). • Comma separator ; quoted fields wrap with `"` and double inner `"`
 * characters. • CRLF or LF line endings — both tolerated. • First non-empty line **must** be the
 * header row matching [TradeEntryCsvEncoder.HEADERS] verbatim (case-sensitive).
 *
 * Returns a [DecodeResult] with the parsed rows **and** any per-line errors accumulated. The caller
 * decides whether to persist (typically only when `errors.isEmpty()` — see the atomic-batch
 * contract documented on `TradeEntryService.importCsv`).
 */
object TradeEntryCsvDecoder {

  /** Order-locked column layout shared with [TradeEntryCsvEncoder]. */
  private val HEADERS = TradeEntryCsvEncoder.HEADERS

  data class DecodeResult(val rows: List<TradeEntryRequest>, val errors: List<ImportError>)

  fun decode(csv: String): DecodeResult {
    // Strip BOM if present — Excel writes it on every save and the encoder emits one too.
    val cleaned = csv.removePrefix("﻿")
    val lines = cleaned.split("\r\n", "\n").filter { it.isNotBlank() }
    if (lines.isEmpty()) {
      return DecodeResult(
        rows = emptyList(),
        errors = listOf(ImportError(line = 1, message = "CSV is empty")),
      )
    }

    val headerCells = parseRow(lines.first())
    if (headerCells != HEADERS) {
      return DecodeResult(
        rows = emptyList(),
        errors =
          listOf(
            ImportError(
              line = 1,
              message =
                "Header row does not match the expected layout. " +
                  "Expected ${HEADERS.size} columns : ${HEADERS.joinToString(",")}",
            )
          ),
      )
    }

    val rows = mutableListOf<TradeEntryRequest>()
    val errors = mutableListOf<ImportError>()
    for ((index, line) in lines.drop(1).withIndex()) {
      // `index` is 0-based starting from the first data row ; the file's 1-based line number
      // is +2 (header is line 1).
      val lineNo = index + 2
      try {
        val cells = parseRow(line)
        if (cells.size != HEADERS.size) {
          errors.add(
            ImportError(
              line = lineNo,
              message = "Expected ${HEADERS.size} columns, got ${cells.size}",
            )
          )
          continue
        }
        rows.add(toRequest(cells, lineNo))
      } catch (e: DecodeException) {
        errors.add(ImportError(line = lineNo, message = e.message ?: "Unknown decode error"))
      }
    }

    return DecodeResult(rows = rows, errors = errors)
  }

  // ============================================================================
  // RFC 4180 row parser — handles quoted fields with inner commas / quotes / newlines.
  // Newlines inside a quoted field aren't supported here because we pre-split on `\n` ;
  // not a concern given the encoder never emits them (notes are trimmed by the frontend).
  // ============================================================================
  internal fun parseRow(line: String): List<String> {
    val cells = mutableListOf<String>()
    val current = StringBuilder()
    var inQuotes = false
    var i = 0
    while (i < line.length) {
      val c = line[i]
      when {
        inQuotes && c == '"' && i + 1 < line.length && line[i + 1] == '"' -> {
          current.append('"')
          i += 2
        }
        c == '"' -> {
          inQuotes = !inQuotes
          i++
        }
        !inQuotes && c == ',' -> {
          cells.add(current.toString())
          current.clear()
          i++
        }
        else -> {
          current.append(c)
          i++
        }
      }
    }
    cells.add(current.toString())
    return cells
  }

  // ============================================================================
  // Cell-by-cell typed mapping. The order of `cells` matches HEADERS by construction
  // (validated above).
  // ============================================================================
  private fun toRequest(cells: List<String>, lineNo: Int): TradeEntryRequest {
    // The CSV layout is frozen on the legacy flat columns (issue #93 — the multi-exec CSV format is
    // a dedicated future ticket). We reconstruct a *simple* position from them : one ENTRY leg
    // (size @ openPrice) and, when the trade was closed, one EXIT leg (size @ exitPrice). The
    // direction is inferred short-biased, and profitDollars / gainPercent (cells 7-8) are ignored
    // on
    // import — they are recomputed from the executions by the service.
    val size = optionalPositiveInt(cells[4], "size")
    val openPrice = optionalPositiveDecimal(cells[5], "openPrice")
    val exitPrice = optionalDecimal(cells[6], "exitPrice")

    val executions = mutableListOf<ExecutionRequest>()
    if (size != null && openPrice != null) {
      executions.add(ExecutionRequest(kind = ExecutionKind.ENTRY, shares = size, price = openPrice))
      if (exitPrice != null) {
        executions.add(
          ExecutionRequest(kind = ExecutionKind.EXIT, shares = size, price = exitPrice)
        )
      }
    }
    val direction =
      if (executions.isEmpty()) null
      else TradePositionCalculator.inferDirection(openPrice, exitPrice)

    return TradeEntryRequest(
      tradeDate = requireDate(cells[0], "tradeDate"),
      ticker = requireNonBlank(cells[1], "ticker").trim().uppercase(),
      direction = direction,
      executions = executions,
      play = optionalEnum(cells[2], "play", TradePlay::valueOf, TradePlay.entries.map { it.name }),
      pattern =
        optionalEnum(
          cells[3],
          "pattern",
          TradePattern::valueOf,
          TradePattern.entries.map { it.name },
        ),
      note = optionalString(cells[9]),
      pre935To10h = optionalBoolean(cells[10], "pre935To10h"),
      preGapUp50 = optionalBoolean(cells[11], "preGapUp50"),
      prePrice1To10 = optionalBoolean(cells[12], "prePrice1To10"),
      preFloat3To50m = optionalBoolean(cells[13], "preFloat3To50m"),
      preWaitPush = optionalBoolean(cells[14], "preWaitPush"),
      openSide =
        optionalEnum(
          cells[15],
          "openSide",
          TradeOpenSide::valueOf,
          TradeOpenSide.entries.map { it.name },
        ),
      shortOnResistance = optionalBoolean(cells[16], "shortOnResistance"),
      exitStrategy =
        optionalEnum(
          cells[17],
          "exitStrategy",
          TradeExitStrategy::valueOf,
          TradeExitStrategy.entries.map { it.name },
        ),
      errorNote = optionalString(cells[18]),
    )
  }

  private fun requireNonBlank(raw: String, field: String): String =
    raw.trim().ifBlank { throw DecodeException("$field is required") }

  private fun requireDate(raw: String, field: String): LocalDate {
    val trimmed = requireNonBlank(raw, field)
    return try {
      LocalDate.parse(trimmed)
    } catch (_: DateTimeParseException) {
      throw DecodeException("$field must be an ISO date (yyyy-MM-dd), got '$trimmed'")
    }
  }

  private fun optionalPositiveInt(raw: String, field: String): Int? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    val n =
      trimmed.toIntOrNull() ?: throw DecodeException("$field must be an integer, got '$trimmed'")
    if (n <= 0) throw DecodeException("$field must be positive, got $n")
    return n
  }

  private fun optionalPositiveDecimal(raw: String, field: String): BigDecimal? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    val n =
      trimmed.toBigDecimalOrNull()
        ?: throw DecodeException("$field must be a decimal, got '$trimmed'")
    if (n <= BigDecimal.ZERO)
      throw DecodeException("$field must be positive, got ${n.toPlainString()}")
    return n
  }

  private fun optionalDecimal(raw: String, field: String): BigDecimal? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    return trimmed.toBigDecimalOrNull()
      ?: throw DecodeException("$field must be a decimal, got '$trimmed'")
  }

  private fun optionalBoolean(raw: String, field: String): Boolean? {
    val trimmed = raw.trim().lowercase()
    return when (trimmed) {
      "" -> null
      "true" -> true
      "false" -> false
      else -> throw DecodeException("$field must be true / false / empty, got '$trimmed'")
    }
  }

  private fun optionalString(raw: String): String? = raw.trim().ifBlank { null }

  private fun <T : Enum<T>> optionalEnum(
    raw: String,
    field: String,
    valueOf: (String) -> T,
    allowed: List<String>,
  ): T? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    return runCatching { valueOf(trimmed.uppercase()) }
      .getOrElse {
        throw DecodeException(
          "$field must be one of ${allowed.joinToString(" / ")} or empty, got '$trimmed'"
        )
      }
  }

  /** Internal — converted to an [ImportError] with the matching `line` by [decode]. */
  private class DecodeException(message: String) : RuntimeException(message)
}
