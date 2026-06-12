package com.portfolioai.stats.domain

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Filter criteria for the stats listing endpoint. All fields optional — null = no filter on that
 * axis. Combined with the per-user **visibility** predicate (own rows + global IMPORT rows) by
 * [com.portfolioai.stats.infrastructure.persistence.StatEntrySpecifications].
 *
 * - [query] — ticker `LIKE %query%` (case-insensitive).
 * - [dateFrom] / [dateTo] — inclusive `trade_date` range.
 * - [source] — keep only one origin (RADAR / MANUAL / IMPORT).
 * - [gapMin] / [gapMax] — inclusive `gap_up_percent` range (value encoding, 52.00 = 52 %).
 */
data class StatEntryFilter(
  val query: String? = null,
  val dateFrom: LocalDate? = null,
  val dateTo: LocalDate? = null,
  val source: StatSource? = null,
  val gapMin: BigDecimal? = null,
  val gapMax: BigDecimal? = null,
)
