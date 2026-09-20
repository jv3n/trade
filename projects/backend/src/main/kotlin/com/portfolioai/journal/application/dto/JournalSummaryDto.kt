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
)
