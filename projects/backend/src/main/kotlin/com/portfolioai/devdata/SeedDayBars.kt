package com.portfolioai.devdata

import com.portfolioai.daybars.domain.Bar
import com.portfolioai.stats.domain.StatEntry
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.random.Random

/**
 * A plausible day of 1-min bars for a seeded GUS (#804) : the premarket up to its PM high, the
 * open, the push to its top at the typed time, the HOD, the fall to the LOD, the close at the EOD,
 * the after-hours drift. Each typed point lands on its candle, so the local chart shows its marks
 * and nothing amber. Seeded per stat, so a stat's chart is the same after every purge.
 */
internal object SeedDayBars {
  private val NEW_YORK: ZoneId = ZoneId.of("America/New_York")
  private const val PM_OPEN = 4 * 60
  private const val OPEN = 9 * 60 + 30
  private const val CLOSE = 16 * 60
  private const val AH_CLOSE = 20 * 60

  fun of(stat: StatEntry): List<Bar> {
    val random = Random((stat.tradeDate.toEpochDay() * 31 + stat.ticker.hashCode()).toInt())
    val open = stat.openPrice.typed()
    val push = stat.pushOpenPrice.typed()
    val hod = stat.hodPrice.typed()
    val lod = stat.lodPrice.typed()
    val eod = stat.eodPrice.typed()
    val pushAt = checkNotNull(stat.pushOpenTime).let { it.hour * 60 + it.minute }
    val hodAt = if (hod > push) pushAt + 35 else pushAt
    val lodAt = hodAt + 90 + random.nextInt(120)
    // Peaks and troughs : each is the extreme of the stretch between its neighbours.
    val anchors =
      listOf(
          PM_OPEN to stat.pmOpen.typed(),
          8 * 60 + 40 to stat.pmHigh.typed(),
          OPEN - 1 to open * 1.01,
          OPEN to open,
          pushAt to push,
          pushAt + 15 to (push + lod) / 2,
          hodAt to hod,
          lodAt to lod,
          CLOSE - 1 to eod,
          AH_CLOSE - 1 to eod * 0.99,
        )
        .distinctBy { it.first }

    val path = DoubleArray(AH_CLOSE)
    anchors.zipWithNext().forEach { (from, to) ->
      for (m in from.first..to.first) {
        val f = (m - from.first).toDouble() / (to.first - from.first).coerceAtLeast(1)
        path[m] = from.second + (to.second - from.second) * (0.5 - cos(PI * f) / 2)
      }
    }

    val bars = mutableListOf<Bar>()
    var previous = path[PM_OPEN]
    for (m in PM_OPEN until AH_CLOSE) {
      val session = m in OPEN until CLOSE
      val noise = path[m] * (if (session) 0.006 else 0.002)
      var close = path[m] + (random.nextDouble() - 0.5) * noise
      var o = previous
      var high = maxOf(o, close) + random.nextDouble() * noise
      var low = minOf(o, close) - random.nextDouble() * noise
      if (session) {
        // The session never prints past its typed HOD and LOD, and the push tops at its price.
        val ceiling = if (m <= pushAt + 10) push else hod
        high = minOf(high, ceiling)
        low = maxOf(low, lod)
        o = o.coerceIn(low, high)
        close = close.coerceIn(low, high)
      }
      when (m) {
        OPEN -> o = open
        pushAt -> high = push
        hodAt -> high = hod
        lodAt -> low = lod
        CLOSE - 1 -> close = eod
      }
      val volume =
        (if (session) 40_000 else 6_000) *
          (0.4 + random.nextDouble()) *
          (if (m in OPEN until OPEN + 30) 5 else 1)
      bars +=
        Bar(
          time = stat.tradeDate.atTime(LocalTime.of(m / 60, m % 60)).atZone(NEW_YORK).toInstant(),
          open = price(o),
          high = price(maxOf(high, o, close)),
          low = price(minOf(low, o, close)),
          close = price(close),
          volume = abs(volume).toLong(),
        )
      previous = close
    }
    return bars
  }

  /** A seeded stat carries every session price — the seeder sets them all. */
  private fun BigDecimal?.typed(): Double = checkNotNull(this).toDouble()

  private fun price(value: Double): BigDecimal =
    BigDecimal(value).setScale(4, RoundingMode.HALF_UP).max(BigDecimal("0.0100"))
}
