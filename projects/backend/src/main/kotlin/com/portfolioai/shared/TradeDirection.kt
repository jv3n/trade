package com.portfolioai.shared

/**
 * Direction of a traded position. Shared by the journal (which owns it) and the account ledger
 * (which copies it onto a TRADE movement for its label), hence `shared/` rather than one module's
 * `domain/` — same reasoning as [Pattern].
 *
 * `SHORT` = sell-to-open then buy-to-cover (the bread-and-butter of the gap-up small-caps strategy)
 * ; `BUY` = buy-to-open then sell-to-close. The direction drives the sign of the realized P&L in
 * [TradePositionCalculator]. Names must match the Postgres enum `trade_direction` values
 * (case-sensitive).
 */
enum class TradeDirection {
  BUY,
  SHORT,
}
