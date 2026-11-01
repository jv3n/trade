package com.portfolioai.daybars.domain

import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

/** A halt read off the bars : the last bar before the gap, and the first one after it. */
data class Halt(
  val haltedAt: Instant,
  val reopenedAt: Instant,
  val lastClose: BigDecimal,
  val reopenPrice: BigDecimal,
)

/**
 * Reads a day's halts off its 1-min bars (#786) — the free plan flags none, but a halt shows as no
 * bar for 5 minutes or more on a ticker that trades around it. A gap must start in the session and
 * reopen by the close : a stock can reopen on the 16:00 bar (POM 21/10), the rest of the extended
 * hours is not read.
 */
object HaltReader {
  private val NEW_YORK: ZoneId = ZoneId.of("America/New_York")
  private val SESSION_OPEN: LocalTime = LocalTime.of(9, 30)
  private val SESSION_CLOSE: LocalTime = LocalTime.of(16, 0)
  private val MIN_GAP: Duration = Duration.ofMinutes(5)
  private const val BARS_EACH_SIDE = 5

  /**
   * Calibrated on 29/10 : 38 session gaps, the 35 of thin tickers (GENVR, MEGL, PARA's quiet
   * stretches) stay under 5,000 shares a minute, CETX's and PARA's reopens are above 20,000.
   */
  private const val MIN_VOLUME_A_MINUTE = 10_000L

  /** The halts of [bars], given in time order. */
  fun of(bars: List<Bar>): List<Halt> =
    bars.indices.toList().zipWithNext().mapNotNull { (last, next) ->
      val before = bars[last]
      val after = bars[next]
      val halted =
        Duration.between(before.time, after.time) >= MIN_GAP &&
          startsInSession(before.time) &&
          reopensByClose(after.time) &&
          tradesAround(bars, next)
      if (halted) Halt(before.time, after.time, before.close, after.open) else null
    }

  private fun startsInSession(time: Instant): Boolean =
    time.newYorkTime().let { it >= SESSION_OPEN && it < SESSION_CLOSE }

  private fun reopensByClose(time: Instant): Boolean = time.newYorkTime() <= SESSION_CLOSE

  /** One side can be quiet : PARA traded 1,300 a minute before its 15-minute halt, 40,000 after. */
  private fun tradesAround(bars: List<Bar>, reopen: Int): Boolean {
    val around =
      bars.subList(
        (reopen - BARS_EACH_SIDE).coerceAtLeast(0),
        (reopen + BARS_EACH_SIDE).coerceAtMost(bars.size),
      )
    return around.sumOf { it.volume } / around.size >= MIN_VOLUME_A_MINUTE
  }

  private fun Instant.newYorkTime(): LocalTime = atZone(NEW_YORK).toLocalTime()
}
