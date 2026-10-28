package com.portfolioai.daybars.application

import com.portfolioai.daybars.domain.Bar
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit spec for [BarsCodec] (#784) — a day of 1-min bars stored as gzipped text :
 * - it reads back **exactly** what was written, prices to their last digit (a $0.42 stock moves in
 *   fractions of a cent, and a rounded bar would put a typed point beside its candle) ;
 * - a full day (4:00–20:00, 960 bars) fits in a few kilobytes — the size the storage was chosen on.
 *
 * No Spring / DB here.
 */
class BarsCodecTest {

  @Test
  fun `a day of bars reads back exactly, sub-dollar prices included`() {
    val bars =
      listOf(
        bar("2026-10-16T13:30:00Z", "0.4210", "0.4388", "0.4105", "0.4302", 182_340),
        bar("2026-10-16T13:31:00Z", "0.4302", "0.4450", "0.4290", "0.44", 96_015),
      )

    assertEquals(bars, BarsCodec.decode(BarsCodec.encode(bars)))
  }

  @Test
  fun `a full extended-hours day stays within a few kilobytes`() {
    val start = Instant.parse("2026-10-21T08:00:00Z")
    val day =
      (0 until 960).map { m ->
        val price = BigDecimal("1.00").add(BigDecimal(m % 37).movePointLeft(3))
        Bar(
          start.plusSeconds(60L * m),
          price,
          price + BigDecimal("0.012"),
          price,
          price,
          1_000L + m,
        )
      }

    val encoded = BarsCodec.encode(day)

    assertEquals(day, BarsCodec.decode(encoded))
    assertTrue(encoded.size < 16_000, "${encoded.size} bytes")
  }

  private fun bar(time: String, o: String, h: String, l: String, c: String, v: Long) =
    Bar(Instant.parse(time), BigDecimal(o), BigDecimal(h), BigDecimal(l), BigDecimal(c), v)
}
