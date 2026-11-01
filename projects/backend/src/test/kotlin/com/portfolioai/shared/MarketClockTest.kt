package com.portfolioai.shared

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Pins the trading day (#842) : Cloud Run runs in UTC, so `LocalDate.now()` turned the day four or
 * five hours early, every evening between 19:00 or 20:00 and midnight in New York.
 */
class MarketClockTest {

  private fun utc(instant: String) = Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)

  @Test
  fun `the evening in New York is still its day, when UTC has already turned`() {
    assertEquals(LocalDate.of(2026, 11, 1), utc("2026-11-02T02:30:00Z").marketToday())
  }

  @Test
  fun `midnight in New York turns the day, whatever the offset of the season`() {
    assertEquals(LocalDate.of(2026, 7, 1), utc("2026-07-02T03:59:00Z").marketToday())
    assertEquals(LocalDate.of(2026, 7, 2), utc("2026-07-02T04:00:00Z").marketToday())
    assertEquals(LocalDate.of(2026, 12, 1), utc("2026-12-02T04:59:00Z").marketToday())
    assertEquals(LocalDate.of(2026, 12, 2), utc("2026-12-02T05:00:00Z").marketToday())
  }
}
