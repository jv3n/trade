package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.shared.UpstreamUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory symbol search for local dev — matches against a hand-curated list of ~30 well-known
 * US + TSX tickers (deliberately the kind of symbols a Wealthsimple Canadian user would actually
 * hold).
 *
 * Activation : `market.provider: mock` (the default in `application.yml`).
 *
 * Matching rules :
 * - Case-insensitive prefix match on **symbol** ("AAP" → AAPL).
 * - Case-insensitive substring match on **name** ("apple" → AAPL).
 * - Results sorted symbol-first then name-first for stable ordering across reloads.
 * - [limit] capped at 50 to mirror what the live endpoint enforces.
 *
 * Reserved test paths (mirrors [MockMarketChartClient]) :
 * - Query exactly `RATELIMIT` → throws [UpstreamUnavailableException] so the 503 path is reachable
 *   without the network. Kept on the mock so a developer can exercise the empty/error UI without
 *   provisioning a real Twelve Data key.
 * - Query exactly `UNKNOWN` → returns an empty list (a "no results" path is the natural mock for
 *   "ticker not found" — the live adapter also returns empty when nothing matches).
 */
@Component
class MockSymbolSearchClient : SymbolSearchClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun search(query: String, limit: Int): List<SymbolMatch> {
    val trimmed = query.trim()
    if (trimmed.isEmpty()) return emptyList()

    val upper = trimmed.uppercase()
    if (upper == "RATELIMIT") throw UpstreamUnavailableException("rate-limited (mock)")
    if (upper == "UNKNOWN") return emptyList()

    // The caller is trusted to pass a sane [limit] — `SymbolSearchService.search` clamps to
    // `[1, MAX_LIMIT]` upstream, so the adapter doesn't double-clamp.
    log.debug("Mock symbol search query='{}' limit={}", trimmed, limit)
    return SEED.asSequence()
      .filter { it.matches(trimmed) }
      .sortedWith(compareBy({ it.symbol }, { it.name }))
      .take(limit)
      .toList()
  }

  private fun SymbolMatch.matches(query: String): Boolean =
    symbol.startsWith(query, ignoreCase = true) || name.contains(query, ignoreCase = true)

  companion object {
    /**
     * Seed list — kept short and recognisable rather than exhaustive. The point is that a developer
     * typing `AAP` / `RY` / `SPY` immediately gets useful suggestions, not that the mock mirrors
     * NASDAQ in full.
     */
    private val SEED: List<SymbolMatch> =
      listOf(
        // US — large caps tech / consumer
        SymbolMatch("AAPL", "Apple Inc", "NASDAQ"),
        SymbolMatch("MSFT", "Microsoft Corporation", "NASDAQ"),
        SymbolMatch("GOOGL", "Alphabet Inc Class A", "NASDAQ"),
        SymbolMatch("AMZN", "Amazon.com Inc", "NASDAQ"),
        SymbolMatch("META", "Meta Platforms Inc", "NASDAQ"),
        SymbolMatch("NVDA", "NVIDIA Corporation", "NASDAQ"),
        SymbolMatch("TSLA", "Tesla Inc", "NASDAQ"),
        SymbolMatch("AMD", "Advanced Micro Devices Inc", "NASDAQ"),
        SymbolMatch("INTC", "Intel Corporation", "NASDAQ"),
        SymbolMatch("NFLX", "Netflix Inc", "NASDAQ"),
        // US — financials / consumer staples
        SymbolMatch("JPM", "JPMorgan Chase & Co", "NYSE"),
        SymbolMatch("V", "Visa Inc", "NYSE"),
        SymbolMatch("MA", "Mastercard Incorporated", "NYSE"),
        SymbolMatch("WMT", "Walmart Inc", "NYSE"),
        SymbolMatch("KO", "The Coca-Cola Company", "NYSE"),
        SymbolMatch("PEP", "PepsiCo Inc", "NASDAQ"),
        SymbolMatch("DIS", "The Walt Disney Company", "NYSE"),
        SymbolMatch("MCD", "McDonald's Corporation", "NYSE"),
        SymbolMatch("NKE", "NIKE Inc", "NYSE"),
        // US — passive-portfolio ETF staples
        SymbolMatch("SPY", "SPDR S&P 500 ETF Trust", "NYSE Arca"),
        SymbolMatch("QQQ", "Invesco QQQ Trust", "NASDAQ"),
        SymbolMatch("VTI", "Vanguard Total Stock Market ETF", "NYSE Arca"),
        // TSX — banks + telecom + energy (typical CA Wealthsimple holdings)
        SymbolMatch("RY.TO", "Royal Bank of Canada", "Toronto Stock Exchange"),
        SymbolMatch("TD.TO", "Toronto-Dominion Bank", "Toronto Stock Exchange"),
        SymbolMatch("BNS.TO", "Bank of Nova Scotia", "Toronto Stock Exchange"),
        SymbolMatch("ENB.TO", "Enbridge Inc", "Toronto Stock Exchange"),
        SymbolMatch("CNR.TO", "Canadian National Railway", "Toronto Stock Exchange"),
        SymbolMatch("BCE.TO", "BCE Inc", "Toronto Stock Exchange"),
        SymbolMatch("SHOP.TO", "Shopify Inc", "Toronto Stock Exchange"),
        SymbolMatch("VFV.TO", "Vanguard S&P 500 Index ETF", "Toronto Stock Exchange"),
      )
  }
}
