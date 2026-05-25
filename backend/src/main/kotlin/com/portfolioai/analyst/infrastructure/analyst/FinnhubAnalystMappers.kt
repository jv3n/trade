package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.analyst.domain.MonthlyRecommendation
import com.portfolioai.analyst.domain.PriceTarget
import com.portfolioai.analyst.domain.deriveConsensus
import java.math.BigDecimal
import java.time.LocalDate

/**
 * Pure conversion from Finnhub's wire payloads to our domain types. Lives in its own file so we can
 * unit-test the parsing on JSON fixtures without spinning up MockWebServer.
 */

/**
 * How many monthly snapshots we keep in [AnalystSnapshot.history] — enough to show a quarter or two
 * of trend.
 */
private const val HISTORY_DEPTH = 6

/**
 * Builds the domain snapshot from the recommendation array (newest-first as Finnhub returns it) and
 * an optional price target. Throws [NoSuchElementException] when the recommendation list is empty —
 * symmetric with the rest of the project's "no coverage = 404" convention.
 *
 * The history is sorted **oldest-first** in the output so the front renders the trend left-to-right
 * naturally.
 */
fun toAnalystSnapshot(
  symbol: String,
  recommendations: List<FinnhubRecommendationItem>,
  priceTarget: FinnhubPriceTarget?,
  priceTargetUnavailable: Boolean = false,
): AnalystSnapshot {
  if (recommendations.isEmpty()) {
    throw NoSuchElementException("No analyst coverage for $symbol")
  }
  // Defensive re-sort (the docs say newest-first but we don't trust the wire order). After this
  // `byDate` is oldest-first.
  val byDate = recommendations.sortedBy { it.period }
  val head = byDate.last()
  val total = head.strongBuy + head.buy + head.hold + head.sell + head.strongSell
  val history =
    byDate.takeLast(HISTORY_DEPTH).map {
      MonthlyRecommendation(
        period = LocalDate.parse(it.period),
        strongBuy = it.strongBuy,
        buy = it.buy,
        hold = it.hold,
        sell = it.sell,
        strongSell = it.strongSell,
      )
    }
  val target = priceTarget?.toDomainOrNull()
  return AnalystSnapshot(
    symbol = symbol.uppercase(),
    asOf = LocalDate.parse(head.period),
    strongBuy = head.strongBuy,
    buy = head.buy,
    hold = head.hold,
    sell = head.sell,
    strongSell = head.strongSell,
    totalAnalysts = total,
    consensus = deriveConsensus(head.strongBuy, head.buy, head.hold, head.sell, head.strongSell),
    priceTarget = target,
    // Invariant: only meaningful when the target is null. A successful fetch always reads
    // `unavailable=false` regardless of what the caller passed.
    priceTargetUnavailable = target == null && priceTargetUnavailable,
    history = history,
  )
}

/**
 * Converts the price-target payload to the domain — or returns `null` when the payload is the
 * "empty shell" (all zeros) Finnhub emits for symbols it doesn't have a target on. Distinguishing
 * "no target available" from "target = $0" matters for the UI : we'd rather hide the line than show
 * "$0 target".
 */
internal fun FinnhubPriceTarget.toDomainOrNull(): PriceTarget? {
  val isEmpty =
    targetHigh.compareTo(BigDecimal.ZERO) == 0 &&
      targetLow.compareTo(BigDecimal.ZERO) == 0 &&
      targetMean.compareTo(BigDecimal.ZERO) == 0 &&
      targetMedian.compareTo(BigDecimal.ZERO) == 0
  if (isEmpty) return null
  return PriceTarget(
    high = targetHigh,
    low = targetLow,
    mean = targetMean,
    median = targetMedian,
    numberOfAnalysts = numberOfAnalysts,
  )
}
