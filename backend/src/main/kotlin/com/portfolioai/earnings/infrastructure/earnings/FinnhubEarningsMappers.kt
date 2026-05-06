package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.earnings.domain.EarningsReport
import com.portfolioai.earnings.domain.EarningsSnapshot
import com.portfolioai.earnings.domain.EarningsTime
import com.portfolioai.earnings.domain.computeSurprisePercent
import java.time.LocalDate

/**
 * Pure conversion from Finnhub's wire payloads to our domain types. Lives in its own file so we can
 * unit-test the parsing on JSON fixtures without spinning up MockWebServer.
 */

/**
 * How many reported quarters we keep in [EarningsSnapshot.lastReports] — Finnhub returns up to ~30,
 * we want the last year (4 quarters) to keep the panel short and readable.
 */
private const val REPORTS_DEPTH = 4

/**
 * Builds the domain snapshot from the reports array (newest-first as Finnhub returns it) and an
 * optional next-announcement date. Throws [NoSuchElementException] when both inputs are empty —
 * symmetric with the rest of the project's "no coverage = 404" convention.
 *
 * The reports are sorted **oldest-first** in the output so the front renders the trend left-to-
 * right naturally.
 */
fun toEarningsSnapshot(
  symbol: String,
  reports: List<FinnhubEarningsItem>,
  calendar: FinnhubEarningsCalendarResponse?,
): EarningsSnapshot {
  val nextEntry = pickNextAnnouncement(symbol, calendar)
  if (reports.isEmpty() && nextEntry == null) {
    throw NoSuchElementException("No earnings data for $symbol")
  }
  // Defensive re-sort (Finnhub documents newest-first but we don't trust the wire order). After
  // this `byDate` is oldest-first.
  val byDate = reports.sortedBy { it.period }
  val lastReports =
    byDate.takeLast(REPORTS_DEPTH).map {
      EarningsReport(
        period = LocalDate.parse(it.period),
        epsEstimate = it.estimate,
        epsActual = it.actual,
        surprisePercent = computeSurprisePercent(it.estimate, it.actual),
      )
    }
  return EarningsSnapshot(
    symbol = symbol.uppercase(),
    nextEarningsDate = nextEntry?.let { LocalDate.parse(it.date) },
    nextEarningsTime = nextEntry?.hour?.let { mapHour(it) },
    lastReports = lastReports,
  )
}

/**
 * Picks the next upcoming announcement from the calendar — earliest date with a null `epsActual`
 * (i.e. not yet reported). Returns `null` when the calendar is null (endpoint failed soft) or empty
 * (no announcement scheduled in the queried window).
 *
 * We deliberately filter on `epsActual == null` rather than `date >= today` because Finnhub
 * occasionally lists the just-reported quarter on the morning of the print — looking at `epsActual`
 * is the cleanest "did it happen yet" signal.
 */
private fun pickNextAnnouncement(
  symbol: String,
  calendar: FinnhubEarningsCalendarResponse?,
): FinnhubEarningsCalendarItem? {
  if (calendar == null) return null
  return calendar.earningsCalendar
    .filter { it.symbol.equals(symbol, ignoreCase = true) && it.epsActual == null }
    .minByOrNull { it.date }
}

private fun mapHour(hour: String): EarningsTime =
  when (hour.lowercase()) {
    "bmo" -> EarningsTime.BEFORE_MARKET
    "amc" -> EarningsTime.AFTER_MARKET
    else -> EarningsTime.UNSPECIFIED
  }
