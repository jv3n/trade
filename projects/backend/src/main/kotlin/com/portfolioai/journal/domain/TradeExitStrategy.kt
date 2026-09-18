package com.portfolioai.journal.domain

/**
 * Planned exit strategy — `SWING_20` = hold until +20 % is hit, `EOD` = close at end of day
 * regardless. Matches the Postgres enum `trade_exit_strategy`.
 */
enum class TradeExitStrategy {
  SWING_20,
  EOD,
}
