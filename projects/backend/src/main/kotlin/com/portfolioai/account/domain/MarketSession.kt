package com.portfolioai.account.domain

import com.portfolioai.shared.NEW_YORK
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

/** The New York session — the market clock of the Today page : a day is over at the 16:00 close. */
object MarketSession {
  private val CLOSE: LocalTime = LocalTime.of(16, 0)

  fun isOver(day: LocalDate, now: Instant): Boolean {
    val newYork = now.atZone(NEW_YORK)
    val today = newYork.toLocalDate()
    return day.isBefore(today) || (day == today && !newYork.toLocalTime().isBefore(CLOSE))
  }
}
