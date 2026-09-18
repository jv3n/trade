package com.portfolioai.journal.domain

/**
 * Setup pattern the trade is based on. Names must match the Postgres enum `trade_pattern` values
 * (case-sensitive).
 *
 * GUS — Gap Up Stuff (morning gap-up continuation play) FRD — Front-side Reversal Down (short setup
 * on parabolic exhaustion)
 */
enum class TradePattern {
  GUS,
  FRD,
}
