package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import java.math.BigDecimal
import java.math.RoundingMode
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory market screener for local dev — returns a deterministic fixture of mid-cap-ish US
 * tickers so the `/radar` page can be exercised end-to-end without a Polygon (or Finnhub / FMP /
 * Alpaca) key.
 *
 * Activation : the only [MarketScreenerClient] bean registered in Sprint 1. Sprint 2 introduces the
 * real adapter behind a `RoutingMarketScreenerClient` keyed on `screener.provider`.
 *
 * Fixture design — hand-curated, **not** seeded random :
 * - **3 strong movers** that clear the default thresholds (gap ≥ 5 % AND volume ≥ 3× avg) so the
 *   page never looks empty out of the box.
 * - **2 borderline cases** that match one axis but not the other — surface bugs in filter logic
 *   that AND-combine the criteria incorrectly.
 * - **1 gap-down** — radar's primary use case is gap-up, but the [TickerMover.gapPct] field is
 *   signed and a future « gap-down » preset reuses the same row shape.
 * - **A few boring tickers** under threshold on both axes — noise the filter must reject.
 * - **2 tickers outside the universe** — one too small ($1B), one too large ($30B) — to exercise
 *   the universe-level cap filter (NASDAQ_MID_CAP is $2B–$10B).
 * - **1 NYSE ticker** — exercises the universe exchange filter.
 *
 * Symbol selection is plausible (real mid-caps, real sectors) so the UI screenshots aren't
 * uncanny-valley. Numbers are fabricated — none of this reflects live market state.
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
        // --- 3 strong movers (clear both default thresholds) ---
        mover(
          symbol = "RDDT",
          name = "Reddit Inc.",
          price = "78.40",
          previousClose = "67.20",
          volume = 24_500_000L,
          volumeAvg30d = 6_000_000L,
          marketCapUsd = 9_800_000_000L,
          sector = "Communication Services",
        ),
        mover(
          symbol = "SOFI",
          name = "SoFi Technologies Inc.",
          price = "12.85",
          previousClose = "11.50",
          volume = 88_000_000L,
          volumeAvg30d = 22_000_000L,
          marketCapUsd = 7_500_000_000L,
          sector = "Financial Services",
        ),
        mover(
          symbol = "AFRM",
          name = "Affirm Holdings Inc.",
          price = "52.10",
          previousClose = "47.00",
          volume = 18_000_000L,
          volumeAvg30d = 4_500_000L,
          marketCapUsd = 6_200_000_000L,
          sector = "Financial Services",
        ),
        // --- 2 borderline (matches one axis only) ---
        // Gap OK (+8.1%) but volume only 2× avg → fails default volume floor
        mover(
          symbol = "WBD",
          name = "Warner Bros. Discovery Inc.",
          price = "9.20",
          previousClose = "8.51",
          volume = 60_000_000L,
          volumeAvg30d = 30_000_000L,
          marketCapUsd = 8_900_000_000L,
          sector = "Communication Services",
        ),
        // Volume OK (4× avg) but gap only +2.5% → fails default gap floor
        mover(
          symbol = "PARA",
          name = "Paramount Global",
          price = "12.30",
          previousClose = "12.00",
          volume = 40_000_000L,
          volumeAvg30d = 10_000_000L,
          marketCapUsd = 7_900_000_000L,
          sector = "Communication Services",
        ),
        // --- 1 gap-down (negative gap, high volume) ---
        mover(
          symbol = "LCID",
          name = "Lucid Group Inc.",
          price = "2.05",
          previousClose = "2.30",
          volume = 95_000_000L,
          volumeAvg30d = 25_000_000L,
          marketCapUsd = 4_800_000_000L,
          sector = "Consumer Cyclical",
        ),
        // --- Boring tickers under threshold on both axes ---
        mover(
          symbol = "ROKU",
          name = "Roku Inc.",
          price = "61.00",
          previousClose = "60.40",
          volume = 5_200_000L,
          volumeAvg30d = 4_800_000L,
          marketCapUsd = 8_700_000_000L,
          sector = "Communication Services",
        ),
        mover(
          symbol = "PINS",
          name = "Pinterest Inc.",
          price = "32.10",
          previousClose = "31.95",
          volume = 9_000_000L,
          volumeAvg30d = 8_500_000L,
          marketCapUsd = 9_500_000_000L,
          sector = "Communication Services",
        ),
        mover(
          symbol = "Z",
          name = "Zillow Group Inc.",
          price = "55.20",
          previousClose = "54.80",
          volume = 2_900_000L,
          volumeAvg30d = 2_700_000L,
          marketCapUsd = 6_400_000_000L,
          sector = "Real Estate",
        ),
        mover(
          symbol = "TWLO",
          name = "Twilio Inc.",
          price = "67.30",
          previousClose = "66.50",
          volume = 4_100_000L,
          volumeAvg30d = 3_800_000L,
          marketCapUsd = 9_900_000_000L,
          sector = "Technology",
        ),
        // --- 2 tickers outside the cap range (universe filter exercise) ---
        // Too small — $1.2B, below the $2B floor
        mover(
          symbol = "CHWY",
          name = "Chewy Inc.",
          price = "18.40",
          previousClose = "16.20",
          volume = 30_000_000L,
          volumeAvg30d = 8_000_000L,
          marketCapUsd = 1_200_000_000L,
          sector = "Consumer Cyclical",
        ),
        // Too large — $30B, above the $10B ceiling
        mover(
          symbol = "PLTR",
          name = "Palantir Technologies Inc.",
          price = "29.50",
          previousClose = "26.00",
          volume = 110_000_000L,
          volumeAvg30d = 28_000_000L,
          marketCapUsd = 30_000_000_000L,
          sector = "Technology",
        ),
        // --- 1 NYSE ticker (universe exchange filter exercise) ---
        mover(
          symbol = "F",
          name = "Ford Motor Company",
          price = "11.20",
          previousClose = "10.10",
          volume = 200_000_000L,
          volumeAvg30d = 55_000_000L,
          marketCapUsd = 5_500_000_000L,
          exchange = "NYSE",
          sector = "Consumer Cyclical",
        ),
      )

    @Suppress("LongParameterList") // Private fixture builder — each param maps 1-1 to a column in
    // the synthetic snapshot table above ; grouping into a sub-record would only obscure the
    // per-ticker literal block at the call sites.
    private fun mover(
      symbol: String,
      name: String,
      price: String,
      previousClose: String,
      volume: Long,
      volumeAvg30d: Long,
      marketCapUsd: Long,
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
      )
    }
  }
}
