package com.portfolioai.stats.domain

import com.portfolioai.shared.Pattern
import java.time.LocalDate

/** Completion status a listing can be narrowed to. */
enum class StatStatus {
  /** The session block is still missing — the stat waits for the 4 pm entry. */
  TO_COMPLETE,
  /** Every session price is in. */
  COMPLETED,
}

/**
 * Filter criteria for the stats listing. All fields optional — null = no filter on that axis. The
 * per-user scope is mandatory and lives in
 * [com.portfolioai.stats.infrastructure.persistence.StatEntrySpecifications], not here.
 *
 * - [query] — ticker `LIKE %query%` (case-insensitive).
 * - [dateFrom] / [dateTo] — inclusive `trade_date` range.
 * - [pattern] — keep a single pattern.
 * - [status] — to complete vs completed.
 *
 * The "traded / not traded" axis of the mockup needs the journal link and lands with the stat ->
 * trade flow (#193).
 */
data class StatEntryFilter(
  val query: String? = null,
  val dateFrom: LocalDate? = null,
  val dateTo: LocalDate? = null,
  val pattern: Pattern? = null,
  val status: StatStatus? = null,
)
