package com.portfolioai.stats.application

import com.portfolioai.stats.application.dto.ImportError
import com.portfolioai.stats.application.dto.StatEntryRequest
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Parses the trade-stats CSV (cf. `docs/data-input/stats-demo.csv`) into [StatEntryRequest] rows.
 *
 * Format — RFC 4180-ish, same conventions as the journal decoder : • UTF-8, optional BOM at file
 * start (skipped silently). • Comma separator ; quoted fields wrap with `"` and double inner `"`. •
 * CRLF or LF line endings — both tolerated. • First non-empty line **must** be the header row
 * matching [HEADERS] verbatim (case-sensitive). The headers are the human-readable labels the user
 * works with (`Gap Up`, `>20% Inst?`, `LOD (Low of Day)`…), not the entity field names — this CSV
 * is hand-authored, not a roundtrip export.
 *
 * The three derived percentage columns (`%push`, `%LOD`, `%EOD`) are intentionally **absent** from
 * the layout : they are computed at insert time, not imported.
 *
 * Returns a [DecodeResult] with the parsed rows **and** any per-line errors accumulated. The caller
 * (see `StatEntryService.importCsv`) only persists when `errors.isEmpty()` — atomic batch.
 */
object StatEntryCsvDecoder {

  /** Order-locked column layout. Must match the demo CSV header verbatim. */
  val HEADERS: List<String> =
    listOf(
      "Date",
      "Ticker",
      "Gap Up",
      "Float",
      "Institutions %",
      ">20% Inst?",
      "<\$1 stock?",
      "SSR?",
      "Entry after 11AM?",
      "Notes",
      "Open",
      "High",
      "LOD (Low of Day)",
      "EOD (End of Day)",
    )

  data class DecodeResult(val rows: List<StatEntryRequest>, val errors: List<ImportError>)

  fun decode(csv: String): DecodeResult {
    // Strip BOM if present — Excel writes it on every save.
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

    val rows = mutableListOf<StatEntryRequest>()
    val errors = mutableListOf<ImportError>()
    for ((index, line) in lines.drop(1).withIndex()) {
      // `index` is 0-based from the first data row ; the file's 1-based line number is +2.
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
        rows.add(toRequest(cells))
      } catch (e: DecodeException) {
        errors.add(ImportError(line = lineNo, message = e.message ?: "Unknown decode error"))
      }
    }

    return DecodeResult(rows = rows, errors = errors)
  }

  // ============================================================================
  // RFC 4180 row parser — handles quoted fields with inner commas / quotes.
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
  // Cell-by-cell typed mapping. Cell order matches HEADERS by construction (validated above).
  // ============================================================================
  private fun toRequest(cells: List<String>): StatEntryRequest =
    StatEntryRequest(
      tradeDate = requireDate(cells[0], "Date"),
      ticker = requireNonBlank(cells[1], "Ticker").uppercase(),
      gapUpPercent = requireDecimal(cells[2], "Gap Up"),
      floatSharesMillions = requirePositiveDecimal(cells[3], "Float"),
      institutionsPercent = requireNonNegativeDecimal(cells[4], "Institutions %"),
      instOver20 = requireBoolean(cells[5], ">20% Inst?"),
      under1Dollar = requireBoolean(cells[6], "<\$1 stock?"),
      ssr = requireBoolean(cells[7], "SSR?"),
      entryAfter11am = requireBoolean(cells[8], "Entry after 11AM?"),
      note = optionalString(cells[9]),
      openPrice = requirePositiveDecimal(cells[10], "Open"),
      highPrice = requirePositiveDecimal(cells[11], "High"),
      lodPrice = requirePositiveDecimal(cells[12], "LOD (Low of Day)"),
      eodPrice = requirePositiveDecimal(cells[13], "EOD (End of Day)"),
    )

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

  /** Any-sign decimal (a gap can in principle be negative). */
  private fun requireDecimal(raw: String, field: String): BigDecimal {
    val trimmed = requireNonBlank(raw, field)
    return trimmed.toBigDecimalOrNull()
      ?: throw DecodeException("$field must be a decimal, got '$trimmed'")
  }

  private fun requireNonNegativeDecimal(raw: String, field: String): BigDecimal {
    val n = requireDecimal(raw, field)
    if (n < BigDecimal.ZERO) throw DecodeException("$field must be >= 0, got ${n.toPlainString()}")
    return n
  }

  private fun requirePositiveDecimal(raw: String, field: String): BigDecimal {
    val n = requireDecimal(raw, field)
    if (n <= BigDecimal.ZERO)
      throw DecodeException("$field must be positive, got ${n.toPlainString()}")
    return n
  }

  private fun requireBoolean(raw: String, field: String): Boolean {
    return when (raw.trim().lowercase()) {
      "true" -> true
      "false" -> false
      else -> throw DecodeException("$field must be true / false, got '${raw.trim()}'")
    }
  }

  private fun optionalString(raw: String): String? = raw.trim().ifBlank { null }

  /** Internal — converted to an [ImportError] with the matching `line` by [decode]. */
  private class DecodeException(message: String) : RuntimeException(message)
}
