package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.analyst.domain.AnalystRecommendationClient
import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.analyst.domain.MonthlyRecommendation
import com.portfolioai.analyst.domain.PriceTarget
import com.portfolioai.analyst.domain.deriveConsensus
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import kotlin.random.Random
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory analyst recommendations source for local dev — generates a deterministic synthetic
 * snapshot per symbol so the dossier "Fondamentaux" panel can be exercised without a Finnhub key
 * and without burning the free quota in iteration.
 *
 * Activation : `analyst.provider: mock` (the default in `application.yml`).
 *
 * Properties of the generator :
 * - **Deterministic per symbol** — same symbol always yields the same breakdown (seed = symbol
 *   hash). Reload the dossier and the panel looks identical.
 * - **Varied across symbols** — the seed influences both the bucket distribution AND the price
 *   target so the panel reads differently from one ticker to the next.
 * - **Realistic shape** — 6 monthly snapshots with small drift between consecutive months (so the
 *   trend line on the front isn't a flat re-emission of the latest), and a price target that sits
 *   broadly around 100 ± 30 (we don't know the actual price so we pick a generic band — the front
 *   compares against `snapshot.quote.price` separately).
 *
 * Reserved symbols :
 * - `UNKNOWN` → throws `NoSuchElementException` (404 path on the controller).
 * - `RATELIMIT` → throws [UpstreamUnavailableException] (503 path) so the front can exercise the
 *   inline error state.
 * - `NOTARGET` → returns a snapshot with `priceTarget = null` so the front's degraded layout
 *   (recommendations only, no target line) is reproducible without flipping providers.
 */
@Component
class MockAnalystClient : AnalystRecommendationClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetch(symbol: String): AnalystSnapshot {
    val upper = symbol.uppercase()
    log.info("Mock analyst recommendations symbol={}", upper)

    when (upper) {
      "UNKNOWN" -> throw NoSuchElementException("No analyst coverage for $upper (mock)")
      "RATELIMIT" -> throw UpstreamUnavailableException("rate-limited (mock)")
    }

    val rng = Random(upper.hashCode().toLong())
    // Bias the distribution per symbol — some tickers come out broadly bullish, others mixed, a
    // few bearish. The thresholds below tile the [0, 100) space into roughly 50/30/20 (bull/mix/
    // bear) so the front sees more BUY chips than SELL — consistent with real analyst behaviour
    // (analysts tend to be net bullish).
    val bias = rng.nextInt(100)
    val totalAnalysts = MIN_ANALYSTS + rng.nextInt(MAX_ANALYSTS - MIN_ANALYSTS + 1)
    val head = drawBuckets(rng, totalAnalysts, bias)

    // Build the 6-month history by drifting the head backwards : each previous month shifts ~1
    // analyst between buckets at random, so the trend line is non-flat without being volatile.
    // History is oldest-first per the domain contract.
    //
    // TODO(coutures-analyst-residus-2) — `LocalDate.now()` direct couples the mock's output to the
    // wall clock. No existing test pins an absolute period (assertions are relative — `out.asOf ==
    // out.history.last().period`), so no flake today. Inject a `Clock` if a future test ever needs
    // to assert on a fixed period. Cf. backlog dette « Coutures post-livraison analyst — résidus ».
    val today = LocalDate.now()
    val history = buildList {
      var cursor = head
      for (monthsBack in (HISTORY_DEPTH - 1) downTo 0) {
        // Snapshot stamped on the 1st of the month — Finnhub's actual cadence too.
        val period = today.minusMonths(monthsBack.toLong()).withDayOfMonth(1)
        add(cursor.toMonthlyRecommendation(period))
        cursor = drift(rng, cursor)
      }
    }

    val priceTarget = if (upper == "NOTARGET") null else drawTarget(rng)

    return AnalystSnapshot(
      symbol = upper,
      asOf = history.last().period,
      strongBuy = head.strongBuy,
      buy = head.buy,
      hold = head.hold,
      sell = head.sell,
      strongSell = head.strongSell,
      totalAnalysts = totalAnalysts,
      consensus = deriveConsensus(head.strongBuy, head.buy, head.hold, head.sell, head.strongSell),
      priceTarget = priceTarget,
      history = history,
    )
  }

  /**
   * Per-period vector of analyst counts. Internal to the mock — the real domain ships
   * [MonthlyRecommendation] which adds a [period] field. Splitting the two avoids the previous
   * shape where [drawBuckets] returned a [MonthlyRecommendation] with a throwaway period that the
   * caller had to overwrite — the intent (we're computing counts, not a snapshot yet) was buried.
   */
  private data class BucketCounts(
    val strongBuy: Int,
    val buy: Int,
    val hold: Int,
    val sell: Int,
    val strongSell: Int,
  )

  private fun BucketCounts.toMonthlyRecommendation(period: LocalDate): MonthlyRecommendation =
    MonthlyRecommendation(
      period = period,
      strongBuy = strongBuy,
      buy = buy,
      hold = hold,
      sell = sell,
      strongSell = strongSell,
    )

  private fun drawBuckets(rng: Random, total: Int, bias: Int): BucketCounts {
    // The bias band picks a target distribution :
    //   < 50 → bullish-leaning (60/25/15 across buy/hold/sell groups, then split inside each group)
    //   < 80 → mixed-leaning (35/40/25)
    //   else → bearish-leaning (20/30/50)
    // Inside each group we split between strong / regular ~30/70 — strongs are rarer.
    val (bullPct, holdPct) =
      when {
        bias < 50 -> 0.60 to 0.25
        bias < 80 -> 0.35 to 0.40
        else -> 0.20 to 0.30
      }
    val bull = (total * bullPct).toInt()
    val hold = (total * holdPct).toInt()
    val bear = (total - bull - hold).coerceAtLeast(0)
    val strongBuy = (bull * 0.30).toInt()
    val buy = bull - strongBuy
    val strongSell = (bear * 0.30).toInt()
    val sell = bear - strongSell
    // tiny noise so two symbols on the same bias bucket don't render identical breakdowns
    val noise = rng.nextInt(3) - 1
    return BucketCounts(
      strongBuy = (strongBuy + noise).coerceAtLeast(0),
      buy = buy.coerceAtLeast(0),
      hold = hold.coerceAtLeast(0),
      sell = sell.coerceAtLeast(0),
      strongSell = strongSell.coerceAtLeast(0),
    )
  }

  /**
   * Drifts the breakdown by ±1 across two random buckets — produces the "stable but moving" feel
   * that real-world analyst trends have month over month.
   */
  private fun drift(rng: Random, current: BucketCounts): BucketCounts {
    val buckets =
      mutableListOf(current.strongBuy, current.buy, current.hold, current.sell, current.strongSell)
    val from = rng.nextInt(buckets.size)
    val to = (from + 1 + rng.nextInt(buckets.size - 1)) % buckets.size
    if (buckets[from] > 0) {
      buckets[from] = buckets[from] - 1
      buckets[to] = buckets[to] + 1
    }
    return BucketCounts(
      strongBuy = buckets[0],
      buy = buckets[1],
      hold = buckets[2],
      sell = buckets[3],
      strongSell = buckets[4],
    )
  }

  private fun drawTarget(rng: Random): PriceTarget {
    // Generic band centred around $100 — the dossier compares to `snapshot.quote.price` separately,
    // so the absolute value here doesn't need to match the price ; only the spread shape matters
    // visually (low ≤ mean ≤ high).
    val mean = BigDecimal(80 + rng.nextInt(40)) // 80–119
    val spread = BigDecimal(10 + rng.nextInt(20)) // 10–29
    val high = (mean + spread).setScale(2, RoundingMode.HALF_UP)
    val low = (mean - spread).setScale(2, RoundingMode.HALF_UP)
    val median = mean.setScale(2, RoundingMode.HALF_UP)
    return PriceTarget(
      high = high,
      low = low,
      mean = mean.setScale(2, RoundingMode.HALF_UP),
      median = median,
      numberOfAnalysts = 8 + rng.nextInt(20),
    )
  }

  companion object {
    private const val MIN_ANALYSTS = 8
    private const val MAX_ANALYSTS = 30
    private const val HISTORY_DEPTH = 6
  }
}
