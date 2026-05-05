package com.portfolioai.market.domain

/**
 * One result returned by the symbol search endpoint — what a user sees in the autocomplete dropdown
 * when typing in the watchlist input. Provider-neutral domain type ; each adapter fills it from its
 * own upstream shape (Twelve Data's `instrument_name` becomes [name], etc.).
 *
 * [exchange] is the human-readable exchange label (`NASDAQ`, `Toronto Stock Exchange`, …) — useful
 * to disambiguate dual-listed tickers (e.g. `BMO` on TSX vs `BMO` on NYSE).
 */
data class SymbolMatch(val symbol: String, val name: String, val exchange: String)
