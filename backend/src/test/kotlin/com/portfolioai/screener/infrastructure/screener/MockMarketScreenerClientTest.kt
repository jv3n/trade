package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.screener.domain.ScreenerUniverse
import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Tests on [MockMarketScreenerClient]. The mock is the only screener adapter wired in Sprint 1, so
 * the `/api/screener/movers` endpoint and the `/radar` page render entirely from this fixture until
 * the real Polygon (or alternative) adapter lands in Sprint 2. Two load-bearing properties are
 * checked here :
 *
 * 1. **Universe filtering happens at the adapter** — exchange + market-cap range are honoured so
 *    the service can trust the snapshot it receives is already inside the bounds.
 * 2. **Fixture contains the expected mix** — at least one ticker that clears the default thresholds
 *    (so the `/radar` page never looks empty out of the box) AND at least one ticker that fails
 *    them (so filter-logic tests upstream have something to reject).
 */
class MockMarketScreenerClientTest {

  private val client = MockMarketScreenerClient()

  @Test
  fun `restricts the snapshot to the universe exchange`() {
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertTrue(snapshot.isNotEmpty(), "fixture should yield at least one NASDAQ mid-cap")
    assertTrue(snapshot.all { it.exchange == "NASDAQ" })
  }

  @Test
  fun `restricts the snapshot to the universe market-cap range`() {
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertTrue(
      snapshot.all { it.marketCapUsd in 2_000_000_000L..10_000_000_000L },
      "every ticker must sit inside the universe cap range",
    )
  }

  @Test
  fun `drops fixture tickers outside the universe cap range`() {
    // CHWY ($1.2B) and PLTR ($30B) live in the fixture to exercise the universe filter — neither
    // should make it through with the default NASDAQ_MID_CAP universe.
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    val symbols = snapshot.map { it.symbol }

    assertFalse("CHWY" in symbols, "CHWY ($1.2B) is below the $2B floor and must be filtered")
    assertFalse("PLTR" in symbols, "PLTR ($30B) is above the $10B ceiling and must be filtered")
  }

  @Test
  fun `drops fixture tickers from another exchange`() {
    // F (Ford) lives on NYSE in the fixture — the NASDAQ-only universe must drop it.
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertFalse("F" in snapshot.map { it.symbol }, "Ford is NYSE-listed and must not surface")
  }

  @Test
  fun `is deterministic across calls`() {
    // The fixture is hard-coded so two calls return the same rows — important because the `/radar`
    // page refreshes on user action and the table shouldn't shuffle without a real data change.
    val a = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    val b = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertEquals(a, b)
  }

  @Test
  fun `contains at least one ticker matching the default thresholds`() {
    // Phase 6 kick-off defaults : gap >= 5%, volume >= 3x avg. If the fixture has no such ticker
    // the v1 `/radar` page lands empty on first load — bad first-time UX.
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    val matches = snapshot.filter {
      it.gapPct >= BigDecimal("5.0") && it.volumeRatio >= BigDecimal("3.0")
    }

    assertTrue(
      matches.size >= 3,
      "fixture should expose at least 3 strong movers, got ${matches.size}",
    )
  }

  @Test
  fun `precomputes gapPct as a signed percentage`() {
    // The mock builds gapPct from price + previousClose using the documented formula. A regression
    // here would silently break the radar sort order, so we verify on a known fixture row.
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    val rddt = snapshot.first { it.symbol == "RDDT" }

    // (78.40 - 67.20) / 67.20 * 100 ≈ 16.67
    assertEquals(BigDecimal("16.67"), rddt.gapPct)
  }

  @Test
  fun `precomputes volumeRatio as volume divided by 30-day average`() {
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    val rddt = snapshot.first { it.symbol == "RDDT" }

    // 24_500_000 / 6_000_000 ≈ 4.08
    assertEquals(BigDecimal("4.08"), rddt.volumeRatio)
  }

  @Test
  fun `keeps gap-down candidates with a negative gapPct`() {
    // LCID in the fixture has a negative gap (-10.87%). Even though the v1 default filter is
    // gap-up focused, the adapter must surface the row — filtering on direction is the service's
    // job, not the adapter's.
    val snapshot = client.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    val lcid = snapshot.firstOrNull { it.symbol == "LCID" }

    assertTrue(lcid != null, "LCID gap-down fixture should be in the NASDAQ mid-cap universe")
    assertTrue(lcid!!.gapPct < BigDecimal.ZERO, "LCID is a gap-down fixture")
  }
}
