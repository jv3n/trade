package com.portfolioai.tradingday.application.dto

/**
 * Body for PUT `/api/trading-days/{date}` — the whole state of the day's marks. A mark already set
 * keeps its original instant ; false clears it.
 */
data class TradingDayRequest(val noCandidate: Boolean, val noTrade: Boolean)
