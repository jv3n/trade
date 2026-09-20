package com.portfolioai.account.application.dto

import java.math.BigDecimal

/**
 * Figures behind the account page's KPI row (#229).
 *
 * [balance] is the **current** account balance — the sum of every movement ever, not a period
 * figure. It is what the broker shows this morning, so windowing it would be meaningless.
 *
 * Everything else is scoped to the filtered period: the P&L of the trades it contains (with how
 * many there were and how many were winners), and the cash injected over it, split into its deposit
 * and withdrawal halves.
 */
data class AccountSummaryDto(
  val balance: BigDecimal,
  val periodPnl: BigDecimal,
  val periodTradeCount: Long,
  val periodWinningTradeCount: Long,
  val periodDeposits: BigDecimal,
  val periodWithdrawals: BigDecimal,
  val periodNetInjected: BigDecimal,
  val periodAdjustments: BigDecimal,
  val periodMovementCount: Long,
)
