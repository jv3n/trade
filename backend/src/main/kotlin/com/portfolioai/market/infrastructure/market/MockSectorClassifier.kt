package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.market.domain.SectorBenchmark
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory sector classifier for local dev — hand-curated mapping of ~25 well-known US + TSX
 * tickers to their GICS sector, then routed through [SpdrSectorEtfs] for the SPDR ETF lookup.
 *
 * Activation : `market.provider: mock` (the default in `application.yml`).
 *
 * Reserved test paths (mirrors [MockSymbolSearchClient] / [MockMarketChartClient]) :
 * - Symbol exactly `RATELIMIT` → throws [MarketUnavailableException] so the 503 path is reachable
 *   without a real Twelve Data key.
 * - Symbol exactly `UNKNOWN` → throws [NoSuchElementException] for the 404 path (sector lookup
 *   failed).
 *
 * Symbols absent from the seed are treated as "no sector mapping" (same 404 path) — that's also how
 * a real provider behaves for an unmapped exotic instrument.
 */
@Component
class MockSectorClassifier : SectorClassifier {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun classify(symbol: String): SectorBenchmark {
    val upper = symbol.trim().uppercase()
    if (upper == "RATELIMIT") throw MarketUnavailableException("rate-limited (mock)")
    if (upper == "UNKNOWN") throw NoSuchElementException("Symbol not found: $upper")

    val sector =
      SECTOR_BY_SYMBOL[upper] ?: throw NoSuchElementException("No sector mapping for $upper")
    log.debug("Mock sector classify {} → {}", upper, sector)
    return SpdrSectorEtfs.resolve(sector)
      ?: throw NoSuchElementException("No SPDR ETF for sector '$sector'")
  }

  companion object {
    /**
     * Hand-curated symbol → sector seed. Same coverage tier as [MockSymbolSearchClient] — enough
     * popular US/CA names that a developer typing AAPL / JPM / RY.TO immediately gets a result, not
     * exhaustive. Sector labels are the canonical SPDR keys (see [SpdrSectorEtfs]).
     */
    private val SECTOR_BY_SYMBOL: Map<String, String> =
      mapOf(
        // Technology
        "AAPL" to "Technology",
        "MSFT" to "Technology",
        "GOOGL" to "Technology",
        "NVDA" to "Technology",
        "AMD" to "Technology",
        "INTC" to "Technology",
        // Communication Services
        "META" to "Communication Services",
        "NFLX" to "Communication Services",
        "DIS" to "Communication Services",
        // Consumer Discretionary
        "AMZN" to "Consumer Discretionary",
        "TSLA" to "Consumer Discretionary",
        "MCD" to "Consumer Discretionary",
        "NKE" to "Consumer Discretionary",
        // Consumer Staples
        "WMT" to "Consumer Staples",
        "KO" to "Consumer Staples",
        "PEP" to "Consumer Staples",
        // Financials
        "JPM" to "Financials",
        "V" to "Financials",
        "MA" to "Financials",
        "RY.TO" to "Financials",
        "TD.TO" to "Financials",
        "BNS.TO" to "Financials",
        // Energy
        "ENB.TO" to "Energy",
        // Industrials
        "CNR.TO" to "Industrials",
      )
  }
}
