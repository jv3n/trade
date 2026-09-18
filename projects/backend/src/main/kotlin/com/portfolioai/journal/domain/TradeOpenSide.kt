package com.portfolioai.journal.domain

/**
 * Side of the move the trade is entered on — `FRONT` = riding the trend up, `BACK` = fading the
 * reversal. Matches the Postgres enum `trade_open_side`.
 */
enum class TradeOpenSide {
  FRONT,
  BACK,
}
