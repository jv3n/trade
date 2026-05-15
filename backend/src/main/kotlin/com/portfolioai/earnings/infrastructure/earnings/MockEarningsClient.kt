package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.earnings.domain.EarningsReport
import com.portfolioai.earnings.domain.EarningsSnapshot
import com.portfolioai.earnings.domain.EarningsTime
import com.portfolioai.earnings.domain.computeSurprisePercent
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import kotlin.random.Random
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * In-memory earnings source for local dev — generates a deterministic synthetic snapshot per symbol
 * so the dossier "Fondamentaux" earnings sub-block can be exercised without a Finnhub key and
 * without burning the free quota in iteration.
 *
 * Activation : `earnings.provider: mock` (the default in `application.yml`).
 *
 * Properties of the generator :
 * - **Deterministic per symbol** — same symbol always yields the same reports + next-date (seed =
 *   symbol hash). Reload the dossier and the panel looks identical.
 * - **Varied across symbols** — the seed influences EPS magnitudes, surprise direction and the
 *   next-date offset so the panel reads differently from one ticker to the next.
 * - **Realistic shape** — 4 quarterly reports stamped on the last 4 fiscal quarter ends, EPS in a
 *   reasonable band ($0.30 – $3.50), surprise ±15 % around the estimate. Next earnings date sits 1
 *   – 60 days out so the countdown tooltip reads naturally.
 *
 * Reserved symbols :
 * - `UNKNOWN` → throws `NoSuchElementException` (404 path on the controller).
 * - `RATELIMIT` → throws [UpstreamUnavailableException] (503 path) so the front can exercise the
 *   inline error state.
 * - `NOCALENDAR` → returns a snapshot with `nextEarningsDate = null` so the front's degraded layout
 *   (reports only, no countdown line) is reproducible without flipping providers.
 */
@Component
class MockEarningsClient : EarningsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetch(symbol: String): EarningsSnapshot {
    val upper = symbol.uppercase()
    log.info("Mock earnings symbol={}", upper)

    when (upper) {
      "UNKNOWN" -> throw NoSuchElementException("No earnings data for $upper (mock)")
      "RATELIMIT" -> throw UpstreamUnavailableException("rate-limited (mock)")
    }

    val rng = Random(upper.hashCode().toLong())
    // Pick a base EPS magnitude per symbol. Some tickers earn pennies, others a few dollars per
    // share — varying it keeps the panel from looking same-y across the watchlist.
    val baseEps = drawBaseEps(rng)
    // Quarter ends — most companies fall on Mar/Jun/Sep/Dec 30. We anchor on the latest such date
    // ≤ today, then walk backwards one quarter at a time. Drift is minor — keeps the test
    // semantics stable as the calendar day moves through the year.
    val today = LocalDate.now()
    val mostRecentQuarterEnd = previousQuarterEnd(today)

    val reports = buildList {
      var cursor = baseEps
      for (q in 0 until REPORTS_DEPTH) {
        val period = mostRecentQuarterEnd.minusMonths((q * 3L))
        // Estimate drifts ±5 % from the base, actual drifts ±15 % around the estimate. This gives
        // a healthy mix of beats / misses without making them all huge.
        val estimate = perturb(cursor, rng, ESTIMATE_DRIFT_PCT)
        val actual = perturb(estimate, rng, ACTUAL_DRIFT_PCT)
        add(
          EarningsReport(
            period = period,
            epsEstimate = estimate,
            epsActual = actual,
            surprisePercent = computeSurprisePercent(estimate, actual),
          )
        )
        // Drift the base for the next (older) quarter — small drift so the time-series looks
        // stable without being flat.
        cursor = perturb(cursor, rng, QUARTER_DRIFT_PCT)
      }
    }
    // We built newest-first ; flip to oldest-first per the domain contract.
    val ordered = reports.reversed()

    val (nextDate, nextTime) =
      if (upper == "NOCALENDAR") {
        null to null
      } else {
        val daysOut = 1 + rng.nextInt(NEXT_EARNINGS_MAX_DAYS)
        // Skewed to match real-world distribution : Finnhub reports ~45 % BMO + ~45 % AMC,
        // ~10 % UNSPECIFIED in practice. A flat 33/33/33 made the dossier feel synthetic on
        // every other ticker.
        val timeBucket = rng.nextInt(100)
        val time =
          when {
            timeBucket < BEFORE_MARKET_PCT -> EarningsTime.BEFORE_MARKET
            timeBucket < BEFORE_MARKET_PCT + AFTER_MARKET_PCT -> EarningsTime.AFTER_MARKET
            else -> EarningsTime.UNSPECIFIED
          }
        today.plusDays(daysOut.toLong()) to time
      }

    return EarningsSnapshot(
      symbol = upper,
      nextEarningsDate = nextDate,
      nextEarningsTime = nextTime,
      lastReports = ordered,
    )
  }

  private fun drawBaseEps(rng: Random): BigDecimal {
    // 0.30 – 3.50 in 0.05 steps — covers small-cap micro EPS up to large-cap dollars per share
    // without descending into negative territory (we'd want a separate path for loss-making
    // tickers eventually).
    val cents = 30 + rng.nextInt(321) // 30 .. 350
    return BigDecimal(cents).divide(BigDecimal(100), 2, RoundingMode.HALF_UP)
  }

  private fun perturb(base: BigDecimal, rng: Random, maxDriftPct: Int): BigDecimal {
    val driftPct = rng.nextInt(maxDriftPct * 2 + 1) - maxDriftPct
    val factor = BigDecimal(100 + driftPct).divide(BigDecimal(100), 4, RoundingMode.HALF_UP)
    val drifted = base.multiply(factor).setScale(2, RoundingMode.HALF_UP)
    // Floor at $0.01 — a $0 estimate would null-out the surprise % via the domain helper.
    return drifted.max(BigDecimal("0.01"))
  }

  /** Most recent quarter end ≤ [reference] (Mar 31 / Jun 30 / Sep 30 / Dec 31). */
  private fun previousQuarterEnd(reference: LocalDate): LocalDate {
    val month = reference.monthValue
    val quarterEndMonth = ((month - 1) / 3) * 3 + 3
    // First-of-month → last-of-month gives the quarter end (e.g. Jun-1 → Jun-30, Sep-1 → Sep-30).
    val firstOfMonth = LocalDate.of(reference.year, quarterEndMonth, 1)
    val quarterEnd = firstOfMonth.withDayOfMonth(firstOfMonth.lengthOfMonth())
    // If today is before this quarter's end, use the previous quarter — pinning the day to the
    // new month's last day handles the Jun-30 → Mar-31 transition (Java would otherwise carry the
    // 30 forward to a 31-day month).
    return if (reference < quarterEnd)
      quarterEnd.minusMonths(3).let { it.withDayOfMonth(it.lengthOfMonth()) }
    else quarterEnd
  }

  private companion object {
    const val REPORTS_DEPTH = 4
    const val ESTIMATE_DRIFT_PCT = 5
    const val ACTUAL_DRIFT_PCT = 15
    const val QUARTER_DRIFT_PCT = 8
    const val NEXT_EARNINGS_MAX_DAYS = 60
    const val BEFORE_MARKET_PCT = 45
    const val AFTER_MARKET_PCT = 45
  }
}
