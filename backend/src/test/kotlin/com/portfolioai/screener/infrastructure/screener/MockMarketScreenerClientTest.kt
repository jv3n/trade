package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.screener.domain.ScreenerUniverse
import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Tests on [MockMarketScreenerClient] — the only screener adapter wired for local dev, so the
 * `/radar` page renders entirely from this fixture. Post-pivot the radar hunts the GUS pattern
 * (gap-up small-caps), so the fixture is curated around the entry checklist. Load-bearing
 * properties checked here:
 *
 * 1. **Universe filtering happens at the adapter** — exchange + cap range are honoured.
 * 2. **The fixture exposes clean GUS candidates** (price $1–$10, gap ≥ 50 %, float 3M–50M) so the
 *    page never lands empty, plus negative cases (gap-down, out-of-range float/price/gap) the
 *    upstream checklist filter must be able to reject.
 * 3. **The GUS-specific float field is carried** — `floatShares`.
 */
class MockMarketScreenerClientTest {

  private val client = MockMarketScreenerClient()
  private val snapshot = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)

  @Test
  fun `restricts the snapshot to the universe exchange`() {
    assertTrue(snapshot.isNotEmpty(), "fixture should yield at least one NASDAQ small-cap")
    assertTrue(snapshot.all { it.exchange == "NASDAQ" })
  }

  @Test
  fun `restricts the snapshot to the universe market-cap range`() {
    assertTrue(
      snapshot.all { it.marketCapUsd in 1_000_000L..2_000_000_000L },
      "every ticker must sit inside the universe cap range",
    )
  }

  @Test
  fun `drops the fixture ticker above the cap ceiling`() {
    // BIGZ ($2.4B) lives in the fixture to exercise the cap gate — it must not surface.
    assertFalse("BIGZ" in snapshot.map { it.symbol }, "BIGZ ($2.4B) is above the $2B ceiling")
  }

  @Test
  fun `drops fixture tickers from another exchange`() {
    // XYZN is NYSE-listed in the fixture — the NASDAQ-only universe must drop it.
    assertFalse("XYZN" in snapshot.map { it.symbol }, "XYZN is NYSE-listed and must not surface")
  }

  @Test
  fun `is deterministic across calls`() {
    val a = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
    val b = client.snapshotMovers(ScreenerUniverse.US_SMALL_CAP_GAPPERS)
    assertEquals(a, b)
  }

  @Test
  fun `exposes at least 3 clean GUS candidates`() {
    // Clears every auto checklist criterion : price $1–$10, gap >= 50 %, float 3M–50M, no split.
    val candidates = snapshot.filter {
      it.price in BigDecimal("1.00")..BigDecimal("10.00") &&
        it.gapPct >= BigDecimal("50.0") &&
        it.floatShares in 3_000_000L..50_000_000L
    }
    assertTrue(
      candidates.size >= 3,
      "fixture should expose >= 3 clean GUS candidates, got ${candidates.size}",
    )
  }

  @Test
  fun `precomputes gapPct as a signed percentage`() {
    val gns = snapshot.first { it.symbol == "GNS" }
    // (2.40 - 1.20) / 1.20 * 100 = 100.00
    assertEquals(BigDecimal("100.00"), gns.gapPct)
  }

  @Test
  fun `precomputes volumeRatio as volume divided by 30-day average`() {
    val gns = snapshot.first { it.symbol == "GNS" }
    // 9_000_000 / 1_500_000 = 6.00
    assertEquals(BigDecimal("6.00"), gns.volumeRatio)
  }

  @Test
  fun `carries the GUS float field`() {
    val gns = snapshot.first { it.symbol == "GNS" }
    assertEquals(12_000_000L, gns.floatShares)
  }

  @Test
  fun `keeps gap-down candidates with a negative gapPct`() {
    val muln = snapshot.firstOrNull { it.symbol == "MULN" }
    assertNotNull(muln, "MULN gap-down fixture should be in the small-cap universe")
    assertTrue(muln!!.gapPct < BigDecimal.ZERO, "MULN is a gap-down fixture")
  }
}
