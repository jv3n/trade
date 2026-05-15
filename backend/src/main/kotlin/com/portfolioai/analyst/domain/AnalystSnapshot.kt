package com.portfolioai.analyst.domain

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Aggregated analyst view for a ticker — what the consensus thinks today + a short trend window of
 * monthly snapshots so the front can show a tendency arrow ("upgraded over the last 3 months",
 * "downgraded", "stable"). The provider-agnostic shape is the same regardless of where the data
 * comes from (today : Finnhub `/stock/recommendation` + `/stock/price-target`).
 *
 * **Empty coverage** is signalled by the port throwing `NoSuchElementException` — same convention
 * as [com.portfolioai.market.domain.MarketChartClient] for an unknown symbol. The front branches on
 * the resulting 404 to render an "no analyst coverage" empty state, which is distinct from a 503
 * (provider down) error state.
 *
 * **Optional [priceTarget]** — sourced from a separate Finnhub endpoint that may sit behind a paid
 * tier on certain accounts (we observed 401/403 in practice for some symbols). When the call fails
 * we keep the recommendation breakdown and surface a `null` target rather than failing the whole
 * fetch. The front degrades the layout gracefully.
 */
data class AnalystSnapshot(
  val symbol: String,
  /** Period of the most recent recommendation snapshot (Finnhub stamps these monthly). */
  val asOf: LocalDate,
  val strongBuy: Int,
  val buy: Int,
  val hold: Int,
  val sell: Int,
  val strongSell: Int,
  /**
   * Sum of the five buckets — 0 means "no analysts covering" but we typically throw 404 instead.
   */
  val totalAnalysts: Int,
  /** Derived label : majority direction read off the breakdown — see [AnalystConsensus]. */
  val consensus: AnalystConsensus,
  val priceTarget: PriceTarget?,
  /**
   * Up to the last 6 months of recommendation snapshots, **oldest first** for a natural left-to-
   * right trend display. The first element is the oldest, the last element matches the head-of-
   * stream snapshot ([asOf], [strongBuy] etc.). Always non-empty in practice — we'd 404 before
   * returning an empty history.
   */
  val history: List<MonthlyRecommendation>,
)

/**
 * One bucket of the breakdown for a given month — same shape as [AnalystSnapshot] but historical.
 */
data class MonthlyRecommendation(
  val period: LocalDate,
  val strongBuy: Int,
  val buy: Int,
  val hold: Int,
  val sell: Int,
  val strongSell: Int,
)

/**
 * 12-month price target consensus across the analysts covering the symbol. Null on the parent
 * snapshot when the upstream endpoint is unavailable for the active plan / symbol.
 */
data class PriceTarget(
  val high: BigDecimal,
  val low: BigDecimal,
  val mean: BigDecimal,
  val median: BigDecimal,
  /**
   * Number of analysts contributing to the target — usually a subset of
   * [AnalystSnapshot.totalAnalysts].
   */
  val numberOfAnalysts: Int,
)

/**
 * Direction label derived from the breakdown counts — a one-glance summary the front renders as a
 * coloured chip. Thresholds chosen to mirror trader convention :
 * - **BUY** if the bullish side (strongBuy + buy) clears 60 %.
 * - **SELL** symmetric on the bearish side.
 * - **HOLD** if hold alone is the absolute majority (≥ 50 %).
 * - **MIXED** otherwise — there's no clear majority direction, the user has to read the chart.
 *
 * The thresholds are deliberately conservative — a 55/45 split shouldn't flash BUY when the reality
 * is "barely leaning". MIXED is honest in those cases.
 */
enum class AnalystConsensus {
  BUY,
  HOLD,
  SELL,
  MIXED,
}

/**
 * Computes the consensus from a breakdown. Lives on the domain so adapters and tests share one
 * source of truth — the heuristic isn't trivial enough to leave to each caller.
 */
fun deriveConsensus(
  strongBuy: Int,
  buy: Int,
  hold: Int,
  sell: Int,
  strongSell: Int,
): AnalystConsensus {
  val total = strongBuy + buy + hold + sell + strongSell
  if (total == 0) return AnalystConsensus.MIXED
  val bullish = (strongBuy + buy).toDouble() / total
  val bearish = (sell + strongSell).toDouble() / total
  val holding = hold.toDouble() / total
  return when {
    bullish >= BUY_THRESHOLD -> AnalystConsensus.BUY
    bearish >= BUY_THRESHOLD -> AnalystConsensus.SELL
    holding >= HOLD_THRESHOLD -> AnalystConsensus.HOLD
    else -> AnalystConsensus.MIXED
  }
}

private const val BUY_THRESHOLD = 0.60
private const val HOLD_THRESHOLD = 0.50
