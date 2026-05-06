package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.InstrumentType
import com.portfolioai.market.domain.MarketChart
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory market data source for local dev — generates a deterministic synthetic OHLC series so
 * the dossier UI can be exercised when the network providers are unreachable (rate-limit, quota
 * exhausted) or off the network entirely.
 *
 * Activation : `market.provider: mock` (the default in `application.yml`).
 *
 * Properties of the generator:
 * - **Deterministic per symbol** — same `(symbol, range, interval)` always yields the same series
 *   (seed = symbol hash), so reloads don't repaint the chart and visual regression remains
 *   possible.
 * - **Varied across symbols** — different base price / drift / volatility keeps the dossier
 *   visually diverse (RSI, drawdown, MA distance all vary).
 * - **Honors `(range, interval)`** — `1d/5m` produces ~80 intraday 5min bars, `5y/1wk` produces
 *   ~260 weekly bars, `1y/1d` (the dossier's reference view) produces 260 daily bars. Required for
 *   the multi-timeframe chart toggle to show a different shape per click rather than the same 1Y
 *   daily curve every time.
 * - **Reserved symbols** for testing edge paths :
 *     - `UNKNOWN` → throws [NoSuchElementException] (404 path)
 *     - `RATELIMIT` → throws [MarketUnavailableException] (503 path)
 */
@Component
class MockMarketChartClient : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetchChart(symbol: String, range: String, interval: String): MarketChart {
    val upper = symbol.uppercase()
    log.info("Mock chart symbol={} range={} interval={}", upper, range, interval)

    when (upper) {
      "UNKNOWN" -> throw NoSuchElementException("Ticker $upper not found (mock)")
      "RATELIMIT" -> throw MarketUnavailableException("rate-limited (mock)")
    }

    // Seed includes range+interval so each timeframe gets a *deterministic but distinct* walk for
    // a given symbol — same chart on reload, visibly different shape across timeframes.
    val seed = "$upper|${range.lowercase()}|${interval.lowercase()}".hashCode().toLong()
    val rng = Random(seed)
    val basePrice = 50.0 + rng.nextDouble() * 250.0 // 50..300
    val drift = (rng.nextDouble() - 0.45) * 0.0008 // small directional bias per bar
    val vol = 0.012 + rng.nextDouble() * 0.012 // 1.2%..2.4% per bar

    val (stepUnit, stepAmount) = barStepFor(interval)
    val barCount = barCountFor(range, interval)
    val now = Instant.now().truncatedTo(stepUnit)
    val bars = ArrayList<OhlcBar>(barCount)

    var price = basePrice
    for (i in (barCount - 1) downTo 0) {
      val bar = now.minus(i.toLong() * stepAmount, stepUnit)
      val open = price
      val ret = drift + (rng.nextDouble() - 0.5) * 2.0 * vol
      price = max(0.01, price * (1.0 + ret))
      val close = price
      val high = max(open, close) * (1.0 + rng.nextDouble() * vol * 0.5)
      val low = min(open, close) * (1.0 - rng.nextDouble() * vol * 0.5)
      val volume = 1_000_000L + rng.nextLong(0L, 10_000_000L)

      bars.add(
        OhlcBar(
          timestamp = bar,
          open = open.toScaled(),
          high = high.toScaled(),
          low = low.toScaled(),
          close = close.toScaled(),
          volume = volume,
        )
      )
    }

    val closes = bars.map { it.close }
    val quote =
      TickerQuote(
        symbol = upper,
        name = "$upper (mock)",
        currency = "USD",
        exchange = "Mock Exchange",
        price = closes.last(),
        fiftyTwoWeekHigh = closes.max(),
        fiftyTwoWeekLow = closes.min(),
        asOf = bars.last().timestamp,
        instrumentType = mockInstrumentType(upper),
      )
    return MarketChart(quote = quote, bars = bars)
  }

  /**
   * Time step per bar, mirroring what the upstream provider would emit at this `interval`.
   * Yahoo-style codes (the project convention) are accepted ; unknown values fall back to daily.
   */
  private fun barStepFor(interval: String): Pair<ChronoUnit, Long> =
    when (interval.lowercase()) {
      "1m" -> ChronoUnit.MINUTES to 1L
      "5m" -> ChronoUnit.MINUTES to 5L
      "15m" -> ChronoUnit.MINUTES to 15L
      "30m" -> ChronoUnit.MINUTES to 30L
      "60m",
      "1h" -> ChronoUnit.HOURS to 1L
      "1wk" -> ChronoUnit.DAYS to 7L
      "1mo" -> ChronoUnit.DAYS to 30L
      // Daily and anything unrecognised fall here — keeps backward compatibility with the
      // previous mock that always produced daily bars.
      else -> ChronoUnit.DAYS to 1L
    }

  /**
   * Number of bars to generate for a given `(range, interval)` combo. Aligned with the frontend
   * `Timeframe` enum so each toggle button shows the visually expected density. The dossier's
   * default `1y / 1d` keeps producing 260 bars — enough headroom for `IndicatorCalculator` to
   * compute every indicator (MA200, perf1y).
   */
  private fun barCountFor(range: String, interval: String): Int =
    when (interval.lowercase()) {
      "5m" ->
        when (range.lowercase()) {
          "1d" -> 80
          else -> 200
        }
      "30m" ->
        when (range.lowercase()) {
          "5d" -> 65
          else -> 100
        }
      "1d" ->
        when (range.lowercase()) {
          "1mo" -> 25
          "3mo" -> 65
          "6mo" -> 130
          // 1y is the dossier's reference view — keep 260 bars (slightly more than 252 trading
          // days) so the longest-lookback indicators (perf1y, MA200) compute cleanly.
          "1y",
          "ytd" -> 260
          "2y" -> 520
          "5y" -> 1300
          else -> 260
        }
      "1wk" ->
        when (range.lowercase()) {
          "5y" -> 260
          else -> 260
        }
      "1mo" -> 60
      else -> 260
    }

  /**
   * Tag the well-known broad-market and SPDR sector ETFs as [InstrumentType.ETF] ; everything else
   * defaults to [InstrumentType.STOCK]. Limited list (~12 symbols) — covers the tickers the dossier
   * surfaces frequently (the four broad indices we use as benchmarks + the 11 SPDR sector ETFs that
   * pop up via `MockSectorClassifier`). Real ETFs the user might browse beyond this list will be
   * misclassified as STOCK in mock mode — accepted limitation since the truth is on the live
   * provider side anyway.
   */
  private fun mockInstrumentType(upper: String): InstrumentType =
    if (upper in MOCK_ETF_SYMBOLS) InstrumentType.ETF else InstrumentType.STOCK

  private companion object {
    /**
     * Well-known ETF tickers the mock recognises. Broad-market (SPY/QQQ/IWM/VOO/VTI/DIA) + the 11
     * SPDR Select Sector ETFs that map back via `MockSectorClassifier`. Anything else defaults to
     * STOCK so the mock dossier behaves like a stock by default.
     */
    val MOCK_ETF_SYMBOLS: Set<String> =
      setOf(
        // Broad market
        "SPY",
        "QQQ",
        "IWM",
        "VOO",
        "VTI",
        "DIA",
        // SPDR Select Sector ETFs
        "XLK",
        "XLF",
        "XLV",
        "XLE",
        "XLY",
        "XLP",
        "XLC",
        "XLI",
        "XLB",
        "XLRE",
        "XLU",
      )
  }

  private fun Double.toScaled(): BigDecimal =
    BigDecimal.valueOf(this).setScale(2, RoundingMode.HALF_UP)
}
