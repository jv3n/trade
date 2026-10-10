package com.portfolioai.journal.application.dto

import com.portfolioai.shared.Pattern
import com.portfolioai.shared.TradeDirection
import java.math.BigDecimal
import java.time.LocalDate

/**
 * One row of the journal (#500) : the trades of one ticker on one day — of one stat or of two (a
 * GUS and a DT, #507) — with what the row reads at a glance. [trades] are in the day's order.
 *
 * - [patterns] / [directions] : one chip each, in the order they first appear that day.
 * - [maxSize] : the largest of the day's trades — never a sum or a net between a short and a long.
 * - [openPrice], [exitPrice], [retainedGainPercent] : only on a single-trade row ; an average
 *   across several trades is a price nothing was bought at, so a multi-trade row leaves them null.
 * - [durationMinutes] : the sum of the trades' durations (« durée cumulée ») — not time in the
 *   market, a trade may hold a flat stretch. Null when no trade has one.
 * - [retainedProfitDollars] : the sum of the retained P&L of the trades that have one.
 * - [enteredLate] : one of the day's trades was entered at 11:00 or later (#651).
 */
data class JournalDayDto(
  val tradeDate: LocalDate,
  val ticker: String,
  val patterns: List<Pattern>,
  val directions: List<TradeDirection>,
  val tradeCount: Int,
  val maxSize: Int?,
  val openPrice: BigDecimal?,
  val exitPrice: BigDecimal?,
  val retainedGainPercent: BigDecimal?,
  val durationMinutes: Long?,
  val retainedProfitDollars: BigDecimal?,
  val enteredLate: Boolean,
  val trades: List<TradeEntryDto>,
)
