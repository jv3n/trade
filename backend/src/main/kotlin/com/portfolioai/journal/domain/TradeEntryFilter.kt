package com.portfolioai.journal.domain

import java.time.LocalDate

/**
 * Filter criteria for the journal's listing endpoint. All fields optional — null = no filter. The
 * status enum captures derived predicates (exit price null/non-null, profit sign) so the caller
 * doesn't have to encode SQL semantics.
 */
data class TradeEntryFilter(
  val query: String? = null,
  val dateFrom: LocalDate? = null,
  val dateTo: LocalDate? = null,
  val plays: List<TradePlay>? = null,
  val patterns: List<TradePattern>? = null,
  val status: TradeStatus? = null,
)

enum class TradeStatus {
  /** Position still open — `exit_price IS NULL`. */
  OPEN,
  /** Position closed — `exit_price IS NOT NULL` (regardless of P/L). */
  CLOSED,
  /** Closed at a profit — `profit_dollars > 0`. */
  PROFITABLE,
  /** Closed at a loss — `profit_dollars < 0`. */
  LOSING,
}
