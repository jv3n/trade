package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.SectorBenchmark

/**
 * Hardcoded mapping from a GICS sector label to the corresponding SPDR Select Sector ETF. Shared by
 * [MockSectorClassifier] (which keys directly on this table) and [TwelveDataSectorClassifier]
 * (which receives a sector string from `/profile` and looks it up here).
 *
 * Coverage : the 11 GICS sectors that span 100 % of S&P 500 constituents. Anything outside this set
 * (commodities, crypto, exotic ETFs) returns `null` from [resolve] and the caller turns that into a
 * 404 — better to be honest "no sector mapping" than to plot a misleading benchmark.
 *
 * Sector label normalisation : Twelve Data and other providers occasionally return aliases
 * ("Information Technology" vs "Technology", "Health Care" vs "Healthcare"). [resolve] is
 * case-insensitive and includes the common synonyms so a fresh provider doesn't break the lookup.
 */
internal object SpdrSectorEtfs {

  /**
   * Canonical sector name (as displayed in the legend) → SPDR ETF (symbol + name). The keys are the
   * labels we want to display to the user ; the synonym map below routes provider variants here.
   */
  private val CANONICAL: Map<String, SectorBenchmark> =
    mapOf(
      "Technology" to SectorBenchmark("Technology", "XLK", "Technology Select Sector SPDR Fund"),
      "Financials" to SectorBenchmark("Financials", "XLF", "Financial Select Sector SPDR Fund"),
      "Healthcare" to SectorBenchmark("Healthcare", "XLV", "Health Care Select Sector SPDR Fund"),
      "Energy" to SectorBenchmark("Energy", "XLE", "Energy Select Sector SPDR Fund"),
      "Consumer Discretionary" to
        SectorBenchmark(
          "Consumer Discretionary",
          "XLY",
          "Consumer Discretionary Select Sector SPDR Fund",
        ),
      "Consumer Staples" to
        SectorBenchmark("Consumer Staples", "XLP", "Consumer Staples Select Sector SPDR Fund"),
      "Communication Services" to
        SectorBenchmark(
          "Communication Services",
          "XLC",
          "Communication Services Select Sector SPDR Fund",
        ),
      "Industrials" to SectorBenchmark("Industrials", "XLI", "Industrial Select Sector SPDR Fund"),
      "Materials" to SectorBenchmark("Materials", "XLB", "Materials Select Sector SPDR Fund"),
      "Real Estate" to
        SectorBenchmark("Real Estate", "XLRE", "Real Estate Select Sector SPDR Fund"),
      "Utilities" to SectorBenchmark("Utilities", "XLU", "Utilities Select Sector SPDR Fund"),
    )

  /**
   * Provider-side synonyms → canonical key. Keep this list short and observed-in-the-wild rather
   * than encyclopaedic — adding noise here makes it harder to spot when an upstream really did
   * return something we don't recognise.
   */
  private val SYNONYMS: Map<String, String> =
    mapOf(
      "information technology" to "Technology",
      "tech" to "Technology",
      "financial services" to "Financials",
      "financial" to "Financials",
      "health care" to "Healthcare",
      "consumer cyclical" to "Consumer Discretionary",
      "consumer defensive" to "Consumer Staples",
      "communications" to "Communication Services",
      "telecommunications" to "Communication Services",
      "basic materials" to "Materials",
    )

  /** `null` if [sectorLabel] doesn't match any SPDR-covered GICS sector. */
  fun resolve(sectorLabel: String?): SectorBenchmark? {
    val trimmed = sectorLabel?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val canonicalKey =
      CANONICAL.keys.firstOrNull { it.equals(trimmed, ignoreCase = true) }
        ?: SYNONYMS[trimmed.lowercase()]
        ?: return null
    return CANONICAL[canonicalKey]
  }
}
