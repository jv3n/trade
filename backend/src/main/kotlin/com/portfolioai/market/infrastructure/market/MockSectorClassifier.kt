package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.SectorBenchmark
import com.portfolioai.shared.UpstreamUnavailableException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory sector classifier for local dev — hand-curated mapping of ~25 well-known US + TSX
 * tickers to their GICS sector, then routed through [SpdrSectorEtfs] for the SPDR ETF lookup.
 *
 * Activation : `market.provider: mock` (the default in `application.yml`).
 *
 * Reserved test paths (mirrors [MockSymbolSearchClient] / [MockMarketChartClient]) :
 * - Symbol exactly `RATELIMIT` → throws [UpstreamUnavailableException] so the 503 path is reachable
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
    // Caller contract (per [SectorClassifierService]) is "trimmed + uppercase". We lean on it
    // rather than re-normalising — see audit 2026-05-06 finding "coutures benchmark v2".
    if (symbol == "RATELIMIT") throw UpstreamUnavailableException("rate-limited (mock)")
    if (symbol == "UNKNOWN") throw NoSuchElementException("Symbol not found: $symbol")

    val sector =
      SECTOR_BY_SYMBOL[symbol] ?: throw NoSuchElementException("No sector mapping for $symbol")
    log.debug("Mock sector classify {} → {}", symbol, sector)
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
