package com.portfolioai.earnings.infrastructure.earnings

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.math.BigDecimal

/**
 * Wire shape for Finnhub `/stock/earnings` — a flat JSON array, each item is one reported quarter
 * with the EPS consensus and the actual print. Reference :
 * https://finnhub.io/docs/api/company-earnings
 *
 * Quirks :
 * - `period` is `YYYY-MM-DD` (the fiscal quarter end) ; we parse it with
 *   [java.time.LocalDate.parse] in the mapper.
 * - The array is **newest-first** in practice — we re-sort defensively in the mapper rather than
 *   trusting the documented ordering.
 * - `actual` and `estimate` can be `null` for very old quarters or symbols with sparse coverage.
 * - `surprise` and `surprisePercent` are emitted by Finnhub but we recompute them in the mapper —
 *   we observed inconsistent rounding on small-cap tickers.
 * - Symbols without coverage return an empty array (HTTP 200) rather than a 404. The mapper
 *   converts that to [NoSuchElementException] when the calendar is also empty.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubEarningsItem(
  val symbol: String,
  val period: String,
  val actual: BigDecimal?,
  val estimate: BigDecimal?,
  val surprise: BigDecimal?,
  val surprisePercent: BigDecimal?,
  val quarter: Int?,
  val year: Int?,
)

/**
 * Wire shape for Finnhub `/calendar/earnings`. Reference :
 * https://finnhub.io/docs/api/earnings-calendar
 *
 * The endpoint returns a top-level object with an `earningsCalendar` array. `from` / `to` query
 * parameters define the window ; we send a 90-day forward window from today to capture the next
 * announcement without burning credits on stale future-future quarters.
 *
 * Quirks :
 * - `epsActual` and `revenueActual` are `null` for upcoming announcements — that's how we filter
 *   "next upcoming" vs "already reported".
 * - `hour` is one of `bmo` (before market open) / `amc` (after market close) / `dmh` (during) /
 *   `""` (unspecified). Mapped to [com.portfolioai.earnings.domain.EarningsTime] in the mapper.
 * - Symbols with no upcoming announcement simply return an empty `earningsCalendar` array (HTTP
 *   200). The adapter swallows that into a `null` next-date rather than failing.
 *
 * The endpoint is documented as free tier but returns 401/403 in practice on some accounts. The
 * adapter swallows those into a `null` next-date rather than failing the whole fetch — the report
 * breakdown is still useful on its own.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubEarningsCalendarResponse(
  val earningsCalendar: List<FinnhubEarningsCalendarItem> = emptyList()
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class FinnhubEarningsCalendarItem(
  val symbol: String,
  /** Announcement date — `YYYY-MM-DD`. Parsed in the mapper. */
  val date: String,
  /** `bmo` / `amc` / `dmh` / `""`. Mapped to [com.portfolioai.earnings.domain.EarningsTime]. */
  val hour: String?,
  val epsActual: BigDecimal?,
  val epsEstimate: BigDecimal?,
)
