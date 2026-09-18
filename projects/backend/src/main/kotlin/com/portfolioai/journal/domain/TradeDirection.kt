package com.portfolioai.journal.domain

/**
 * Direction of a journal position. `SHORT` = sell-to-open then buy-to-cover (the bread-and-butter
 * of the gap-up small-caps strategy) ; `BUY` = buy-to-open then sell-to-close. The direction drives
 * the sign of the realized P&L in [TradePositionCalculator]. Names must match the Postgres enum
 * `trade_direction` values (case-sensitive).
 */
enum class TradeDirection {
  BUY,
  SHORT,
}
