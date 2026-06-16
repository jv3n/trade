package com.portfolioai.account.domain

/**
 * Kind of account movement. The Kotlin names must match the Postgres enum `account_movement_type`
 * values exactly (cf. V6__account_movement.sql) — Hibernate maps via `@JdbcTypeCode(NAMED_ENUM)`,
 * same mechanism as the journal's `trade_play` etc.
 *
 * Sign convention on [AccountMovement.amount] (the effective signed delta on the balance) :
 * - [DEPOSIT] — cash in, amount > 0
 * - [WITHDRAWAL] — cash out, amount < 0
 * - [TRADE] — realized P&L pushed from the journal, amount ± (read-only here)
 * - [ADJUSTMENT] — manual balance correction (broker fees / financing / slippage), amount ±
 */
enum class AccountMovementType {
  DEPOSIT,
  WITHDRAWAL,
  TRADE,
  ADJUSTMENT,
}
