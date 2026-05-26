package com.portfolioai.screener.application

import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerFilter
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import org.springframework.stereotype.Service

/**
 * Orchestrates the market radar pipeline (Phase 6) :
 * 1. Pulls the broad universe snapshot from [MarketScreenerClient] — bounded by exchange + cap
 *    range to keep the upstream call cheap.
 * 2. Applies the dynamic user-tweakable [ScreenerFilter] (gap %, volume ratio, optional sector /
 *    exchange / cap narrowing) in-process — zero extra cost per tweak in the UI.
 * 3. Sorts the matches by `gapPct` descending so the most extreme movers float to the top of the
 *    radar table.
 *
 * **No caching here in Sprint 1** — the mock adapter is a synchronous fixture, no I/O to amortise.
 * Sprint 2 introduces caching at the adapter layer (snapshot per universe with a short TTL),
 * because the universe snapshot is the expensive part — running the filter in-process for every UI
 * tweak is cheap.
 *
 * **Empty result is valid** — a tight filter + a calm market = no rows. The controller returns an
 * empty list, the UI renders the "no abnormal move detected" empty state. No exception is thrown in
 * that path.
 */
@Service
class MarketScreenerService(private val client: MarketScreenerClient) {

  fun findMovers(
    universe: ScreenerUniverse = ScreenerUniverse.NASDAQ_MID_CAP,
    filter: ScreenerFilter = ScreenerFilter.DEFAULT,
  ): List<TickerMover> {
    val snapshot = client.snapshotMovers(universe)
    return snapshot.filter { it.matches(filter) }.sortedByDescending { it.gapPct }
  }

  /**
   * Filter predicate — kept private to the service so the rules stay co-located with the
   * orchestration. Directional `gapPctMin` : positive value = gap-up filter, negative value lets
   * gap-down candidates through. The v1 default (`+5.0`) is gap-up focused (pump precursor).
   *
   * Checks are grouped (movement / cap range / categorical) to keep each boolean expression below
   * the `ComplexCondition` threshold while staying a single guard predicate.
   */
  private fun TickerMover.matches(filter: ScreenerFilter): Boolean {
    val passesMovement = gapPct >= filter.gapPctMin && volumeRatio >= filter.volumeRatioMin
    val passesCapRange =
      (filter.marketCapMin == null || marketCapUsd >= filter.marketCapMin) &&
        (filter.marketCapMax == null || marketCapUsd <= filter.marketCapMax)
    val passesCategorical =
      (filter.exchange == null || exchange.equals(filter.exchange, ignoreCase = true)) &&
        (filter.sector == null || sector.equals(filter.sector, ignoreCase = true))
    return passesMovement && passesCapRange && passesCategorical
  }
}
