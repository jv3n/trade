package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import java.math.BigDecimal
import java.math.RoundingMode
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory market screener for local dev — returns a deterministic fixture of GUS-pattern
 * candidates (gap-up small-caps) so the `/radar` page can be exercised end-to-end without a Polygon
 * / FMP key.
 *
 * Fixture design — hand-curated to exercise the GUS entry checklist (price $1–$10, gap ≥ 50 %,
 * float 3M–50M, no reverse split) applied client-side:
 * - **4 clean GUS candidates** that clear every auto criterion → the radar table renders them.
 * - **Negative cases** that each KO one criterion: float too high (> 50M), float too low (< 3M,
 *   squeezable), price too high (> $10), gap too low (< 50 %), and a gap-down. They land in the raw
 *   snapshot but the checklist filter rejects them.
 * - **2 universe rejects** — one NYSE ticker, one above the $2B cap ceiling — to exercise the
 *   adapter-level universe pre-filter.
 *
 * Symbols are plausible small-cap shapes; numbers are fabricated and reflect no live market state.
 */
@Component
class MockMarketScreenerClient : MarketScreenerClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover> {
    log.info(
      "Mock screener snapshot exchange={} marketCapMinUsd={} marketCapMaxUsd={}",
      universe.exchange,
      universe.marketCapMin,
      universe.marketCapMax,
    )
    return FIXTURES.filter {
      it.exchange == universe.exchange &&
        it.marketCapUsd in universe.marketCapMin..universe.marketCapMax
    }
  }

  companion object {
    private val FIXTURES: List<TickerMover> =
      listOf(
        // --- 4 clean GUS candidates (clear every auto criterion) ---
        mover(
          "GNS",
          "Genius Group Ltd",
          "2.40",
          "1.20",
          9_000_000L,
          1_500_000L,
          29_000_000L,
          12_000_000L,
          "Technology",
        ),
        mover(
          "BBLG",
          "Bone Biologics Corp",
          "4.50",
          "2.80",
          6_000_000L,
          1_000_000L,
          36_000_000L,
          8_000_000L,
          "Healthcare",
        ),
        mover(
          "TOPS",
          "TOP Ships Inc.",
          "1.85",
          "1.05",
          14_000_000L,
          2_200_000L,
          46_000_000L,
          25_000_000L,
          "Industrials",
        ),
        mover(
          "CETX",
          "Cemtrex Inc.",
          "6.20",
          "3.90",
          4_000_000L,
          700_000L,
          31_000_000L,
          5_000_000L,
          "Technology",
        ),
        // --- Negative cases (each KOs one checklist criterion) ---
        // Float too high (120M > 50M cap)
        mover(
          "AREB",
          "American Rebel Holdings",
          "3.10",
          "1.85",
          35_000_000L,
          6_000_000L,
          372_000_000L,
          120_000_000L,
          "Consumer Cyclical",
        ),
        // Float too low (1.5M < 3M — squeezable)
        mover(
          "GMEX",
          "Graphex Group Ltd",
          "2.50",
          "1.40",
          6_000_000L,
          900_000L,
          3_750_000L,
          1_500_000L,
          "Basic Materials",
        ),
        // Price too high ($13.50 > $10)
        mover(
          "HUBC",
          "Hub Cyber Security",
          "13.50",
          "8.40",
          8_000_000L,
          1_400_000L,
          243_000_000L,
          18_000_000L,
          "Technology",
        ),
        // Gap too low (+11.5% < 50%)
        mover(
          "BTAI",
          "BioXcel Therapeutics",
          "3.40",
          "3.05",
          5_000_000L,
          1_100_000L,
          47_600_000L,
          14_000_000L,
          "Healthcare",
        ),
        // Gap-down (negative gap — checklist is gap-up only)
        mover(
          "MULN",
          "Mullen Automotive",
          "1.10",
          "1.95",
          40_000_000L,
          8_000_000L,
          22_000_000L,
          20_000_000L,
          "Consumer Cyclical",
        ),
        // --- 2 universe rejects ---
        // NYSE — excluded by the adapter exchange gate
        mover(
          "XYZN",
          "Xerion Industries",
          "3.00",
          "1.80",
          10_000_000L,
          2_000_000L,
          30_000_000L,
          10_000_000L,
          "Industrials",
          exchange = "NYSE",
        ),
        // Above the $2B cap ceiling — excluded by the adapter cap gate
        mover(
          "BIGZ",
          "BigBear Holdings",
          "4.00",
          "2.50",
          50_000_000L,
          9_000_000L,
          2_400_000_000L,
          600_000_000L,
          "Technology",
        ),
      )

    @Suppress(
      "LongParameterList"
    ) // Private fixture builder — each param maps 1-1 to a column in the
    // synthetic snapshot table above; grouping into a sub-record would only obscure the call sites.
    private fun mover(
      symbol: String,
      name: String,
      price: String,
      previousClose: String,
      volume: Long,
      volumeAvg30d: Long,
      marketCapUsd: Long,
      floatShares: Long,
      sector: String,
      exchange: String = "NASDAQ",
    ): TickerMover {
      val priceBd = BigDecimal(price)
      val prevBd = BigDecimal(previousClose)
      val gapPct =
        priceBd
          .subtract(prevBd)
          .divide(prevBd, 4, RoundingMode.HALF_UP)
          .multiply(BigDecimal(100))
          .setScale(2, RoundingMode.HALF_UP)
      val volumeRatio = BigDecimal(volume).divide(BigDecimal(volumeAvg30d), 2, RoundingMode.HALF_UP)
      return TickerMover(
        symbol = symbol,
        name = name,
        price = priceBd,
        previousClose = prevBd,
        gapPct = gapPct,
        volume = volume,
        volumeAvg30d = volumeAvg30d,
        volumeRatio = volumeRatio,
        marketCapUsd = marketCapUsd,
        exchange = exchange,
        sector = sector,
        floatShares = floatShares,
      )
    }
  }
}
