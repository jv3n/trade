package com.portfolioai.stats.application.dto

/**
 * Outcome of a `POST /api/stats/import` call. Mirrors the journal importer's contract.
 *
 * The import is **atomic** : if any row fails to parse / validate, **no** stat row is persisted
 * (`created == 0` and `errors.isNotEmpty()`). The frontend renders the error list inline so the
 * user can fix the source CSV and retry.
 *
 * @param parsed Number of data rows the parser could read off the wire (header excluded).
 * @param created Number of rows actually persisted. Equals `parsed` on success, `0` when [errors]
 *   is non-empty.
 * @param errors Structured per-row errors. Empty on success.
 */
data class ImportResult(val parsed: Int, val created: Int, val errors: List<ImportError>)

/**
 * One line-level error from the CSV decoder.
 *
 * @param line 1-indexed line number in the source CSV. Line 1 is the header.
 * @param message Human-readable description (e.g. `"openPrice must be positive, got -1"`).
 */
data class ImportError(val line: Int, val message: String)
