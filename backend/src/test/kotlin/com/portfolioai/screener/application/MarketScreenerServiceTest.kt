package com.portfolioai.screener.application

import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerFilter
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Filter / sort logic for the market radar. The service is the only layer between the adapter and
 * the controller — its filter contract is what the UI binds to via the `gapPctMin` /
 * `volumeRatioMin` / `marketCap*` / `exchange` / `sector` query params. A regression here would
 * either flood the radar with noise (filters too permissive) or hide legitimate candidates (filters
 * too aggressive), both of which a user can't easily diagnose from the UI.
 *
 * Each test pins one axis at a time, plus one combo, plus the sort order — the matrix isn't
 * exhaustive but the rules AND together so axis-by-axis coverage protects the whole.
 */
class MarketScreenerServiceTest {

  @Test
  fun `applies the gap floor when filtering`() {
    val service = serviceOf(mover("AAA", gapPct = "10.0"), mover("BBB", gapPct = "3.0"))

    val out = service.findMovers(filter = filter(gapPctMin = "5.0"))

    assertEquals(listOf("AAA"), out.map { it.symbol })
  }

  @Test
  fun `applies the volume ratio floor when filtering`() {
    val service = serviceOf(mover("AAA", volumeRatio = "5.0"), mover("BBB", volumeRatio = "1.5"))

    val out = service.findMovers(filter = filter(volumeRatioMin = "3.0"))

    assertEquals(listOf("AAA"), out.map { it.symbol })
  }

  @Test
  fun `AND-combines all filter axes`() {
    val service =
      serviceOf(
        // matches both axes — should pass
        mover("PASS", gapPct = "10.0", volumeRatio = "5.0"),
        // gap OK, volume too low — fails
        mover("VOLFAIL", gapPct = "10.0", volumeRatio = "1.0"),
        // volume OK, gap too low — fails
        mover("GAPFAIL", gapPct = "1.0", volumeRatio = "5.0"),
      )

    val out = service.findMovers(filter = filter(gapPctMin = "5.0", volumeRatioMin = "3.0"))

    assertEquals(listOf("PASS"), out.map { it.symbol })
  }

  @Test
  fun `keeps gap-down candidates when gapPctMin is negative`() {
    // Directional filter — a negative gapPctMin lets gap-down rows through. Important for any
    // future « gap-down preset » in the UI.
    val service =
      serviceOf(
        mover("UP", gapPct = "8.0", volumeRatio = "4.0"),
        mover("DOWN", gapPct = "-10.0", volumeRatio = "4.0"),
      )

    val out = service.findMovers(filter = filter(gapPctMin = "-20.0", volumeRatioMin = "3.0"))

    assertTrue("UP" in out.map { it.symbol })
    assertTrue("DOWN" in out.map { it.symbol })
  }

  @Test
  fun `narrows the market-cap range further when the filter provides bounds`() {
    val service =
      serviceOf(
        mover("MID", marketCapUsd = 5_000_000_000L),
        mover("LOW", marketCapUsd = 2_500_000_000L),
        mover("HIGH", marketCapUsd = 9_000_000_000L),
      )

    val out =
      service.findMovers(
        filter =
          filter(
            gapPctMin = "0.0",
            volumeRatioMin = "0.0",
            marketCapMin = 3_000_000_000L,
            marketCapMax = 8_000_000_000L,
          )
      )

    assertEquals(listOf("MID"), out.map { it.symbol })
  }

  @Test
  fun `filters by sector when provided`() {
    val service =
      serviceOf(mover("TECH", sector = "Technology"), mover("FIN", sector = "Financial Services"))

    val out =
      service.findMovers(
        filter = filter(gapPctMin = "0.0", volumeRatioMin = "0.0", sector = "Technology")
      )

    assertEquals(listOf("TECH"), out.map { it.symbol })
  }

  @Test
  fun `sector filter is case-insensitive`() {
    val service = serviceOf(mover("TECH", sector = "Technology"))

    val out =
      service.findMovers(
        filter = filter(gapPctMin = "0.0", volumeRatioMin = "0.0", sector = "technology")
      )

    assertEquals(listOf("TECH"), out.map { it.symbol })
  }

  @Test
  fun `drops rows whose sector is null when a sector filter is set`() {
    // A null sector on a [TickerMover] cannot match any non-null sector filter — equivalent to
    // « unknown sector, can't claim membership ». The opposite (no sector filter = wildcard) is
    // already exercised by other tests.
    val service = serviceOf(mover("UNK", sector = null), mover("TECH", sector = "Technology"))

    val out =
      service.findMovers(
        filter = filter(gapPctMin = "0.0", volumeRatioMin = "0.0", sector = "Technology")
      )

    assertFalse("UNK" in out.map { it.symbol })
  }

  @Test
  fun `sorts the matches by gapPct descending`() {
    // Most-gapping at the top is the v1 radar reading order. Without this sort the user has to
    // re-sort every refresh which defeats the « surface what's loud » purpose of the radar.
    val service =
      serviceOf(
        mover("LOW", gapPct = "6.0", volumeRatio = "5.0"),
        mover("MID", gapPct = "12.0", volumeRatio = "5.0"),
        mover("HIGH", gapPct = "20.0", volumeRatio = "5.0"),
      )

    val out = service.findMovers(filter = filter(gapPctMin = "5.0", volumeRatioMin = "3.0"))

    assertEquals(listOf("HIGH", "MID", "LOW"), out.map { it.symbol })
  }

  @Test
  fun `returns an empty list when nothing matches`() {
    // Empty is a valid result — the controller passes it through as 200 OK with []. The UI
    // renders an empty-state hint rather than an error.
    val service = serviceOf(mover("AAA", gapPct = "1.0", volumeRatio = "1.0"))

    val out = service.findMovers(filter = filter(gapPctMin = "5.0", volumeRatioMin = "3.0"))

    assertTrue(out.isEmpty())
  }

  // --- Test factory helpers ---------------------------------------------------------------------

  private fun serviceOf(vararg movers: TickerMover): MarketScreenerService =
    MarketScreenerService(StubScreenerClient(movers.toList()))

  private fun filter(
    gapPctMin: String = "0.0",
    volumeRatioMin: String = "0.0",
    marketCapMin: Long? = null,
    marketCapMax: Long? = null,
    exchange: String? = null,
    sector: String? = null,
  ) =
    ScreenerFilter(
      gapPctMin = BigDecimal(gapPctMin),
      volumeRatioMin = BigDecimal(volumeRatioMin),
      marketCapMin = marketCapMin,
      marketCapMax = marketCapMax,
      exchange = exchange,
      sector = sector,
    )

  private fun mover(
    symbol: String,
    gapPct: String = "10.0",
    volumeRatio: String = "5.0",
    marketCapUsd: Long = 5_000_000_000L,
    sector: String? = "Technology",
    exchange: String = "NASDAQ",
  ): TickerMover =
    TickerMover(
      symbol = symbol,
      name = symbol,
      price = BigDecimal("100.00"),
      previousClose = BigDecimal("90.00"),
      gapPct = BigDecimal(gapPct),
      volume = 10_000_000L,
      volumeAvg30d = 2_000_000L,
      volumeRatio = BigDecimal(volumeRatio),
      marketCapUsd = marketCapUsd,
      exchange = exchange,
      sector = sector,
    )

  private class StubScreenerClient(private val snapshot: List<TickerMover>) : MarketScreenerClient {
    override fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover> = snapshot
  }
}
