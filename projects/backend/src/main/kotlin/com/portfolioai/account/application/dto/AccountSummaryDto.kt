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
 *
 * [periodReconciliationGap] sums the gaps the period's reconciled mornings recorded — what the
 * broker took outside the trades. Unlike [periodAdjustments], no later edit moves it : a fix to an
 * earlier row is absorbed by a correction (#476), never by a recorded gap (#480). Null when no
 * morning was reconciled in the period — nothing was measured, and a plausible 0 would lie. It
 * follows the dates only : the type filter does not apply to mornings.
 *
 * [periodLocates] sums the period's locates, signed (≤ 0) ; [periodUnusedLocates] is its part
 * **paid for nothing** — on a (day, ticker) with no trade in the journal, today's counted once New
 * York has closed. An upper bound : a locate listed back keeps its full cost, its refund being an
 * adjustment. Both follow the dates only, like the gap.
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
  val periodReconciliationGap: BigDecimal?,
  val periodMovementCount: Long,
  val periodLocates: BigDecimal,
  val periodUnusedLocates: BigDecimal,
)
