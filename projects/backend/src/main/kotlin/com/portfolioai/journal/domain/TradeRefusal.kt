package com.portfolioai.journal.domain

import com.portfolioai.shared.RefusalCode

/** Why a trade write was refused. The frontend's `TRADE_REFUSALS` translates each one. */
enum class TradeRefusal : RefusalCode {
  FUTURE_DATE,
  NO_ENTRY,
  EXITS_EXCEED_ENTRIES,
  EXIT_BEFORE_ENTRY,
  REAL_PNL_NEEDS_CLOSED_POSITION,
  STAT_OWNS_PATTERN,
  STAT_OWNS_DAY_AND_TICKER,
}
