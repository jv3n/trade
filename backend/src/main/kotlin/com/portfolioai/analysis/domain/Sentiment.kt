package com.portfolioai.analysis.domain

/**
 * Output sentiment for a ticker narrative. The LLM derives this from the indicators (price vs MAs,
 * RSI, momentum, drawdown) ; values must be one of these three. Per CLAUDE.md, the LLM is a
 * **writer**, not a decider — `BULLISH` here means "the indicators currently lean positive",
 * **not** "buy this stock".
 */
enum class Sentiment {
  BULLISH,
  NEUTRAL,
  BEARISH,
}
