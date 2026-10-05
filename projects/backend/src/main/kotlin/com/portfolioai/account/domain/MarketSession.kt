package com.portfolioai.account.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** The New York session — the market clock of the Today page : a day is over at the 16:00 close. */
object MarketSession {
  private val ZONE: ZoneId = ZoneId.of("America/New_York")
  private val CLOSE: LocalTime = LocalTime.of(16, 0)

  fun isOver(day: LocalDate, now: Instant): Boolean {
    val newYork = now.atZone(ZONE)
    val today = newYork.toLocalDate()
    return day.isBefore(today) || (day == today && !newYork.toLocalTime().isBefore(CLOSE))
  }
}
