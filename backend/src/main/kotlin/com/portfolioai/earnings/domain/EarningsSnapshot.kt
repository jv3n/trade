package com.portfolioai.earnings.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

/**
 * Aggregated earnings view for a ticker — last 4 reported quarters (EPS estimate / actual /
 * surprise %) + the next upcoming earnings date when known. The provider-agnostic shape is the same
 * regardless of where the data comes from (today : Finnhub `/stock/earnings` for reports +
 * `/calendar/earnings` for the upcoming date).
 *
 * **No coverage** is signalled by the port throwing `NoSuchElementException` — same convention as
 * [com.portfolioai.market.domain.MarketChartClient] and the analyst port. The front branches on the
 * resulting 404 to render a "no earnings data" empty state, distinct from a 503 (provider down)
 * error state. We treat empty `lastReports` AND null [nextEarningsDate] as no coverage — there's
 * nothing to show. A snapshot with reports and no upcoming date is fine (most realistic case
 * between announcements).
 *
 * **Optional [nextEarningsDate]** — sourced from Finnhub `/calendar/earnings`, a separate endpoint.
 * Fail-soft to `null` on auth / network / 5xx so the report breakdown is still surfaced — same
 * pattern as the analyst module's optional price target. Distinguishes "no upcoming announcement
 * known" from "we couldn't reach the calendar endpoint" only at log level (warn) ; the user sees
 * the same hidden countdown in either case (acceptable for v1).
 */
data class EarningsSnapshot(
  val symbol: String,
  /** ISO date of the next expected announcement. `null` when unknown / unavailable. */
  val nextEarningsDate: LocalDate?,
  /** Time-of-day hint for [nextEarningsDate]. Finnhub stamps `bmo` / `amc` / `dmh`/ ` ` (empty). */
  val nextEarningsTime: EarningsTime?,
  /**
   * Up to the last 4 quarters of reports, **oldest first** for natural left-to-right rendering on
   * the front. Always non-empty when [nextEarningsDate] is `null` (otherwise the snapshot is "no
   * coverage" and we 404 before returning).
   */
  val lastReports: List<EarningsReport>,
)

/**
 * One reported quarter — period (Finnhub stamps these on the fiscal quarter end), the consensus
 * estimate, the actual print, and the derived surprise %. Any of the three numeric fields can be
 * `null` (e.g. when an analyst panel shrunk and the consensus is missing for a quarter) — the front
 * collapses the row gracefully.
 */
data class EarningsReport(
  val period: LocalDate,
  val epsEstimate: BigDecimal?,
  val epsActual: BigDecimal?,
  /**
   * `(actual − estimate) / |estimate| × 100`, rounded to 2 dp. Computed in the mapper rather than
   * trusting the wire `surprisePercent` field — Finnhub occasionally rounds it inconsistently. The
   * mock relies on the same helper so its output is realistic.
   */
  val surprisePercent: BigDecimal?,
)

/**
 * Time-of-day hint Finnhub returns for upcoming earnings. Drives a small label on the front ("avant
 * ouverture" / "après clôture") so the user knows when to expect the print.
 */
enum class EarningsTime {
  BEFORE_MARKET,
  AFTER_MARKET,
  UNSPECIFIED,
}

/**
 * Computes the surprise % for a single report. Returns `null` when either input is missing or the
 * estimate is zero (would divide by zero — happens in practice for symbols with very small EPS that
 * round to 0). Lives on the domain so adapters and tests share one source of truth.
 */
fun computeSurprisePercent(estimate: BigDecimal?, actual: BigDecimal?): BigDecimal? {
  if (estimate == null || actual == null) return null
  if (estimate.compareTo(BigDecimal.ZERO) == 0) return null
  return (actual - estimate)
    .divide(estimate.abs(), 4, RoundingMode.HALF_UP)
    .multiply(BigDecimal(100))
    .setScale(2, RoundingMode.HALF_UP)
}
