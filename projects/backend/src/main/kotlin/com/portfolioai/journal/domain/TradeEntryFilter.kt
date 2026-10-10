package com.portfolioai.journal.domain

import com.portfolioai.shared.Pattern
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
  val patterns: List<Pattern>? = null,
  val status: TradeStatus? = null,
  val entry: EntryTiming? = null,
)

/**
 * When the trade was entered (#651), read off [TradeEntry.firstEntryAt] against
 * [TradeEntry.LATE_ENTRY]. A trade with no timed entry fill is in neither : its entry time is not
 * known.
 */
enum class EntryTiming {
  /** First timed entry fill before 11:00. */
  BEFORE_11,
  /** First timed entry fill at 11:00 or later. */
  AFTER_11,
}

enum class TradeStatus {
  /** Position still open — `exit_price IS NULL`. */
  OPEN,
  /** Position closed — `exit_price IS NOT NULL` (regardless of P/L). */
  CLOSED,
  /** Closed at a profit — retained P&L > 0. */
  PROFITABLE,
  /** Closed at a loss — retained P&L < 0. */
  LOSING,
}
