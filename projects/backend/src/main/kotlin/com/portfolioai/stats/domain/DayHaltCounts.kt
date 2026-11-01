package com.portfolioai.stats.domain

import java.time.LocalDate

/** A stat's ticker-day, the key its market data is stored under. */
data class TickerDay(val tradingDate: LocalDate, val ticker: String)

/**
 * Port — how many halts each ticker-day had (#829). The day-bars context reads them and implements
 * this ; a port rather than a call to its service, which already depends on the stats.
 */
fun interface DayHaltCounts {
  /** Ticker-days without a halt are absent. */
  fun of(days: Collection<TickerDay>): Map<TickerDay, Int>
}
