package com.portfolioai.screener.domain

/**
 * Per-ticker enrichment data fetched **after** the gainers snapshot — the fields the gainers
 * endpoints don't carry but the GUS checklist needs (float) or shows (premarket volume). Both
 * nullable: a provider may expose one and not the other, and enrichment is best-effort (a failed
 * call yields [EMPTY] rather than failing the whole radar refresh).
 */
data class TickerFundamentals(val floatShares: Long?, val premarketVolume: Long?) {
  companion object {
    val EMPTY = TickerFundamentals(floatShares = null, premarketVolume = null)
  }
}
