package com.portfolioai.stats.domain

import com.portfolioai.shared.Pattern
import java.time.LocalDate

/** Completion status a listing can be narrowed to. */
enum class StatStatus {
  /** Not ticked yet — the session may be empty, partial or even whole. */
  TO_COMPLETE,
  /** Ticked by its owner. */
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
 * - [noPush] — true keeps the « no push » days only (#302), to compare their premarket.
 * - [outOfPattern] — true keeps the stats the recorded prices say were not the setup (#499).
 * - [under1Dollar] — true keeps the stats opened under a dollar (#499).
 *
 * The last two are derived from the prices and read off [StatEntry] in memory, not in SQL : one
 * rule, one place.
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
  val noPush: Boolean? = null,
  val outOfPattern: Boolean? = null,
  val under1Dollar: Boolean? = null,
) {
  /** A derived toggle is on — the listing then pages in memory. */
  val hasDerived: Boolean
    get() = outOfPattern == true || under1Dollar == true

  fun matchesDerived(stat: StatEntry): Boolean =
    (outOfPattern != true || stat.outOfPattern.isNotEmpty()) &&
      (under1Dollar != true || stat.under1Dollar)
}
