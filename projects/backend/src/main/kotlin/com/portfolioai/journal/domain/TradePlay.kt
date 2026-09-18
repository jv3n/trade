package com.portfolioai.journal.domain

/**
 * Play classification — `A` = high-conviction setup, `B` = secondary / opportunistic. Names must
 * match the Postgres enum `trade_play` values (case-sensitive).
 */
enum class TradePlay {
  A,
  B,
}
