package com.portfolioai.stats.domain

import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Unit spec for [StatMetrics] — the pure percentage calculation persisted into the `*_percent`
 * columns at insert time. Pins the encoding contract (value ×100, 2 decimals, HALF_UP) and the sign
 * convention (negative = level below open = favourable for a short). No Spring / DB here.
 */
class StatMetricsTest {

  @Test
  fun `push percent is the rise from open to high, value-encoded to 2 decimals`() {
    // BAC from stats-demo.csv : open 4.20, high 4.45 -> (4.45-4.20)/4.20*100 = 5.952... -> 5.95
    val push = StatMetrics.pushPercent(open = BigDecimal("4.2000"), high = BigDecimal("4.4500"))
    assertEquals(0, push.compareTo(BigDecimal("5.95")), "got ${push.toPlainString()}")
  }

  @Test
  fun `lod percent is negative when the low sits below the open`() {
    // BAC : open 4.20, lod 3.05 -> (3.05-4.20)/4.20*100 = -27.38
    val lod = StatMetrics.lodPercent(open = BigDecimal("4.2000"), lod = BigDecimal("3.0500"))
    assertEquals(0, lod.compareTo(BigDecimal("-27.38")), "got ${lod.toPlainString()}")
  }

  @Test
  fun `eod percent is negative when the close sits below the open`() {
    // BAC : open 4.20, eod 3.10 -> (3.10-4.20)/4.20*100 = -26.19
    val eod = StatMetrics.eodPercent(open = BigDecimal("4.2000"), eod = BigDecimal("3.1000"))
    assertEquals(0, eod.compareTo(BigDecimal("-26.19")), "got ${eod.toPlainString()}")
  }

  @Test
  fun `a level equal to the open yields exactly zero`() {
    val flat = StatMetrics.pushPercent(open = BigDecimal("2.0000"), high = BigDecimal("2.0000"))
    assertEquals(0, flat.compareTo(BigDecimal.ZERO), "got ${flat.toPlainString()}")
  }

  @Test
  fun `rounding is HALF_UP at the second decimal`() {
    // open 3.00, high 3.005 -> 0.005/3.00*100 = 0.16666... -> 0.17
    val push = StatMetrics.pushPercent(open = BigDecimal("3.0000"), high = BigDecimal("3.0050"))
    assertEquals(0, push.compareTo(BigDecimal("0.17")), "got ${push.toPlainString()}")
  }
}
