package com.portfolioai.account.application.dto

import java.math.BigDecimal

/**
 * Aggregates for the account summary panel. All amounts in the account's single currency (USD v1).
 *
 * - [balance] — current balance = deposits + withdrawals + tradesPnl + adjustments
 * - [totalDeposits] — Σ DEPOSIT (≥ 0)
 * - [totalWithdrawals] — Σ WITHDRAWAL (≤ 0, signed)
 * - [netInjected] — totalDeposits + totalWithdrawals (cash the user actually put in)
 * - [tradesPnl] — Σ TRADE (realized P&L pushed from the journal)
 * - [adjustments] — Σ ADJUSTMENT (manual corrections : fees / financing / slippage)
 * - [movementCount] — total number of movements
 */
data class AccountSummaryDto(
  val balance: BigDecimal,
  val totalDeposits: BigDecimal,
  val totalWithdrawals: BigDecimal,
  val netInjected: BigDecimal,
  val tradesPnl: BigDecimal,
  val adjustments: BigDecimal,
  val movementCount: Long,
)
