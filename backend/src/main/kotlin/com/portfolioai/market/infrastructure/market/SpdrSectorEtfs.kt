package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.SectorBenchmark
import com.portfolioai.market.infrastructure.market.SpdrSectorEtfs.resolve

/**
 * Hardcoded mapping from a GICS sector label to the corresponding SPDR Select Sector ETF. Shared by
 * [MockSectorClassifier] (which keys directly on this table) and [FinnhubSectorClassifier] (which
 * receives `finnhubIndustry` from `/stock/profile2` and looks it up here).
 *
 * Coverage : the 11 GICS sectors that span 100 % of S&P 500 constituents. Anything outside this set
 * (commodities, crypto, exotic ETFs) returns `null` from [resolve] and the caller turns that into a
 * 404 — better to be honest "no sector mapping" than to plot a misleading benchmark.
 *
 * Sector label normalisation : Finnhub uses sub-industry granularity ("Banks" / "Insurance" /
 * "Pharmaceuticals" / "Retail"…) that we collapse to the canonical SPDR sector. Other providers
 * occasionally return GICS-form aliases ("Information Technology" vs "Technology", "Health Care" vs
 * "Healthcare"). [resolve] is case-insensitive and includes the common synonyms so a fresh provider
 * doesn't break the lookup.
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
   *
   * Mix of Twelve Data legacy labels (kept for the test suite + any future provider that uses the
   * same vocabulary) and Finnhub `finnhubIndustry` labels (which is what `FinnhubSectorClassifier`
   * receives in production). Finnhub's taxonomy is finer-grained than GICS — we collapse the most
   * common sub-industries we've actually seen on real symbols (banks → Financials, insurance →
   * Financials, retail → Consumer Discretionary, etc.). Anything we haven't seen surfaces as a 404
   * "no sector mapping" — we'd rather be honest than guess.
   */
  private val SYNONYMS: Map<String, String> =
    mapOf(
      // Technology — Twelve Data + Finnhub both use these
      "information technology" to "Technology",
      "tech" to "Technology",
      "semiconductors" to "Technology",
      "software" to "Technology",
      // Financials
      "financial services" to "Financials",
      "financial" to "Financials",
      "banks" to "Financials",
      "banking" to "Financials",
      "insurance" to "Financials",
      // Healthcare
      "health care" to "Healthcare",
      "pharmaceuticals" to "Healthcare",
      "biotechnology" to "Healthcare",
      "medical equipment" to "Healthcare",
      // Consumer Discretionary
      "consumer cyclical" to "Consumer Discretionary",
      "retail" to "Consumer Discretionary",
      "automobiles" to "Consumer Discretionary",
      "auto manufacturers" to "Consumer Discretionary",
      "hotels, restaurants & leisure" to "Consumer Discretionary",
      // Consumer Staples
      "consumer defensive" to "Consumer Staples",
      "food, beverage & tobacco" to "Consumer Staples",
      "household products" to "Consumer Staples",
      // Communication Services
      "communications" to "Communication Services",
      "telecommunications" to "Communication Services",
      "telecommunication" to "Communication Services",
      "media" to "Communication Services",
      // Industrials
      "transportation" to "Industrials",
      "aerospace & defense" to "Industrials",
      "construction" to "Industrials",
      "machinery" to "Industrials",
      // Materials
      "basic materials" to "Materials",
      "chemicals" to "Materials",
      "metals & mining" to "Materials",
      // Energy
      "oil, gas & consumable fuels" to "Energy",
      "oil & gas" to "Energy",
      // Utilities (no common synonyms beyond canonical)
      // Real Estate
      "reit" to "Real Estate",
      "reits" to "Real Estate",
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
