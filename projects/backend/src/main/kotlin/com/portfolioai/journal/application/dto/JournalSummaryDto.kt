package com.portfolioai.journal.application.dto

import java.math.BigDecimal

/**
 * KPIs of the journal page, computed over the **whole filtered set** (not the current page) — the
 * mockup reads them as "September : +751.85 $ over 8 trades, 75 % win rate, profit factor 3.52".
 *
 * Every figure is built on the **retained** P&L (the broker's real one when typed in, the computed
 * one otherwise) — the same number that reaches the account. Trades still open (no realized P&L)
 * count in neither the win nor the loss bucket and are excluded from [tradeCount] : a KPI set that
 * counted them would dilute the win rate with positions that haven't played out yet.
 *
 * @param tradeCount Trades with a realized P&L matching the filter.
 * @param retainedPnl Σ retained P&L — zero when nothing matches.
 * @param winCount Trades whose retained P&L is > 0.
 * @param lossCount Trades whose retained P&L is < 0 (a break-even trade is neither).
 * @param winRatePercent Whole-number percentage (`75.00` = 75 %), null with no closed trade.
 * @param averageWin Average of the winners, null with no winner.
 * @param averageLoss Average of the losers — **negative**, null with no loser.
 * @param profitFactor Σ wins ÷ |Σ losses|, null with no loser (an undefined ratio, not an infinite
 *   one).
 * @param outOfPatternCount Closed trades taken on a stat the recorded prices say was not the setup
 *   (#499) — part of [tradeCount].
 * @param outOfPatternPnl Σ their retained P&L — a discipline number, never a strategy one.
 * @param inRulesPnl Σ the retained P&L of the others ; with [outOfPatternPnl], [retainedPnl].
 * @param lateEntries The closed trades entered at 11:00 or later (#651) — [TradeEntry.enteredLate].
 * @param earlyEntries The closed trades entered before 11:00. A trade with no timed entry fill is
 *   in neither, so the two need not add up to [tradeCount].
 */
data class JournalSummaryDto(
  val tradeCount: Int,
  val retainedPnl: BigDecimal,
  val winCount: Int,
  val lossCount: Int,
  val winRatePercent: BigDecimal?,
  val averageWin: BigDecimal?,
  val averageLoss: BigDecimal?,
  val profitFactor: BigDecimal?,
  val outOfPatternCount: Int,
  val outOfPatternPnl: BigDecimal,
  val inRulesPnl: BigDecimal,
  val lateEntries: EntryTimingFigures,
  val earlyEntries: EntryTimingFigures,
)

/**
 * One side of the « after 11 am » comparison (#651) — does a late entry lose money ?
 *
 * @param tradeCount Closed trades on that side.
 * @param winRatePercent Whole-number percentage of winners, null with no closed trade.
 * @param averagePnl Average retained P&L, null with no closed trade.
 */
data class EntryTimingFigures(
  val tradeCount: Int,
  val winRatePercent: BigDecimal?,
  val averagePnl: BigDecimal?,
)
