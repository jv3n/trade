package com.portfolioai.daybars.domain

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins how a halt is told from the bars (#786) : the free plan flags none, so the only evidence is
 * a gap of 5 minutes or more on a ticker trading around it.
 *
 * What is protected here :
 *
 * - POM 21/10, the nine halts the user checked on the chart — times are the opening minutes of the
 *   bars either side, which is why a halt can start on the very bar the previous one reopened on ;
 * - a thin ticker's quiet minutes are **not** halts, the failure that would tag half the sheet ;
 * - one quiet side does not hide a halt : a stock often wakes up on the news that halted it ;
 * - the extended hours are not read, except a reopen on the 16:00 bar (POM's last halt).
 */
class HaltReaderTest {

  private fun haltsAsText(bars: List<Bar>) =
    HaltReader.of(bars).map { "${hhmm(it)} ${it.lastClose} → ${it.reopenPrice}" }

  @Test
  fun `POM 21-10 gives the nine halts the user read on its chart`() {
    val gaps =
      listOf(
        Gap("09:35", "09:40", "0.69", "0.78"),
        Gap("09:41", "09:51", "0.94", "1.35"),
        Gap("09:51", "09:56", "1.62", "1.55"),
        Gap("09:58", "10:03", "1.22", "1.17"),
        Gap("10:03", "10:08", "1.35", "1.45"),
        Gap("10:16", "10:21", "1.32", "1.40"),
        Gap("10:25", "10:30", "1.53", "1.55"),
        Gap("14:34", "14:39", "1.15", "1.26"),
        Gap("15:30", "16:00", "2.00", "3.01"),
      )

    val halts = haltsAsText(session(gaps))

    assertEquals(gaps.map { "${it.from}-${it.to} ${it.lastClose} → ${it.reopen}" }, halts)
  }

  @Test
  fun `a four-minute gap is no halt`() {
    assertTrue(HaltReader.of(session(listOf(Gap("10:00", "10:04", "1.20", "1.21")))).isEmpty())
  }

  @Test
  fun `a thin ticker's quiet minutes give no halt, however long`() {
    val bars = session(listOf(Gap("11:17", "11:36", "1.76", "1.72")), volume = 500)

    assertTrue(HaltReader.of(bars).isEmpty())
  }

  @Test
  fun `a halt shows on a ticker quiet before it and busy after it`() {
    val quiet = session(listOf(Gap("11:14", "11:29", "3.95", "4.75")), volume = 1_200)
    val wokenUp = quiet.map { if (it.time >= at("11:29")) it.copy(volume = 40_000) else it }

    assertEquals(listOf("11:14-11:29 3.95 → 4.75"), haltsAsText(wokenUp))
  }

  @Test
  fun `a gap in the premarket is not read`() {
    assertTrue(HaltReader.of(listOf(bar("08:00", "1.10", "1.10"), bar("08:10"))).isEmpty())
  }

  @Test
  fun `a gap spanning the open is not read`() {
    assertTrue(HaltReader.of(listOf(bar("09:28"), bar("09:34"))).isEmpty())
  }

  @Test
  fun `a gap in the after-hours is not read`() {
    assertTrue(HaltReader.of(listOf(bar("16:10"), bar("16:30"))).isEmpty())
  }

  @Test
  fun `a gap past the close is not read, it reopens in the after-hours`() {
    assertTrue(HaltReader.of(listOf(bar("15:58"), bar("16:05"))).isEmpty())
  }

  @Test
  fun `a day with no bar gives no halt`() {
    assertTrue(HaltReader.of(emptyList()).isEmpty())
  }

  private data class Gap(
    val from: String,
    val to: String,
    val lastClose: String,
    val reopen: String,
  )

  /** A bar a minute from the open to the close, none inside [gaps], priced at their edges. */
  private fun session(gaps: List<Gap>, volume: Long = 300_000): List<Bar> {
    val minutes =
      generateSequence(LocalTime.of(9, 30)) { it.plusMinutes(1) }
        .takeWhile { it <= LocalTime.of(16, 0) }
        .filterNot { minute ->
          gaps.any { minute > LocalTime.parse(it.from) && minute < LocalTime.parse(it.to) }
        }
    return minutes
      .map { minute ->
        val text = minute.toString()
        bar(
          text,
          open = gaps.firstOrNull { it.to == text }?.reopen ?: "1.00",
          close = gaps.firstOrNull { it.from == text }?.lastClose ?: "1.00",
          volume = volume,
        )
      }
      .toList()
  }

  /** A bar of 21/10, [time] New York, its high and low holding its open and close. */
  private fun bar(
    time: String,
    open: String = "1.00",
    close: String = "1.00",
    volume: Long = 300_000,
  ): Bar {
    val prices = listOf(BigDecimal(open), BigDecimal(close))
    return Bar(at(time), prices[0], prices.max(), prices.min(), prices[1], volume)
  }

  private fun at(time: String) = DAY.atTime(LocalTime.parse(time)).atZone(NEW_YORK).toInstant()

  private fun hhmm(halt: Halt) = "${newYork(halt.haltedAt)}-${newYork(halt.reopenedAt)}"

  private fun newYork(time: Instant) = time.atZone(NEW_YORK).toLocalTime()

  private companion object {
    val DAY: LocalDate = LocalDate.of(2026, 10, 21)
    val NEW_YORK: ZoneId = ZoneId.of("America/New_York")
  }
}
