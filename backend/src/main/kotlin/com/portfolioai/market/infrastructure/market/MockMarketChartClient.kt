package com.portfolioai.market.infrastructure.market

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
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * In-memory market data source for local dev — generates a deterministic synthetic 1y daily series
 * so the dossier UI can be exercised when the network providers are unreachable (rate-limit, quota
 * exhausted) or off the network entirely.
 *
 * Activation : `market.provider: mock` (the default in `application.yml`).
 *
 * Properties of the generator:
 * - **Deterministic per symbol** — same symbol always yields the same series (seed = symbol hash),
 *   so reloads don't repaint the chart and visual regression remains possible.
 * - **Varied across symbols** — different base price / drift / volatility keeps the dossier
 *   visually diverse (RSI, drawdown, MA distance all vary).
 * - **Reserved symbols** for testing edge paths :
 *     - `UNKNOWN` → throws [NoSuchElementException] (404 path)
 *     - `RATELIMIT` → throws [MarketUnavailableException] (503 path)
 */
@Component
@ConditionalOnProperty(name = ["market.provider"], havingValue = "mock", matchIfMissing = true)
class MockMarketChartClient : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetchChart(symbol: String, range: String, interval: String): MarketChart {
    val upper = symbol.uppercase()
    log.info("Mock chart symbol={} range={} interval={}", upper, range, interval)

    when (upper) {
      "UNKNOWN" -> throw NoSuchElementException("Ticker $upper not found (mock)")
      "RATELIMIT" -> throw MarketUnavailableException("rate-limited (mock)")
    }

    val rng = Random(upper.hashCode().toLong())
    val basePrice = 50.0 + rng.nextDouble() * 250.0 // 50..300
    val drift = (rng.nextDouble() - 0.45) * 0.0008 // small directional bias per bar
    val vol = 0.012 + rng.nextDouble() * 0.012 // 1.2%..2.4% daily

    val now = Instant.now().truncatedTo(ChronoUnit.DAYS)
    val bars = ArrayList<OhlcBar>(BAR_COUNT)

    var price = basePrice
    for (i in (BAR_COUNT - 1) downTo 0) {
      val bar = now.minus(i.toLong(), ChronoUnit.DAYS)
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
      )
    return MarketChart(quote = quote, bars = bars)
  }

  private fun Double.toScaled(): BigDecimal =
    BigDecimal.valueOf(this).setScale(2, RoundingMode.HALF_UP)

  companion object {
    // Slightly more than one trading year (252) so the longest-lookback indicators
    // (perf1y at 252 bars, ma200 at 200 bars) have the strict `closes.size > lookback`
    // headroom they require.
    private const val BAR_COUNT = 260
  }
}
