package com.portfolioai.screener.application

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.application.dto.ScreenerSnapshotResponse
import com.portfolioai.screener.application.dto.TickerMoverDto
import com.portfolioai.screener.application.dto.toDto
import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerSnapshotDay
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.infrastructure.persistence.ScreenerSnapshotRepository
import java.time.LocalDate
import java.time.ZoneId
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Orchestrates the market radar pipeline (Phase 6 ticket (9) — snapshot persistance).
 *
 * Two distinct paths since the v0.4 split :
 * 1. [refresh] (called by `POST /api/screener/refresh`) — fetches the universe snapshot from the
 *    active provider, persists it as one [ScreenerSnapshotDay] row, returns the raw movers. The
 *    frontend's « Rechercher » button is the only trigger ; the dynamic filter is **not** applied
 *    here.
 * 2. [loadSnapshot] (called by `GET /api/screener/movers`) — reads the most recent persisted
 *    snapshot for the active provider (or a specific date when the caller asks for one), returns
 *    the raw movers. Zero call to the provider → safe to invoke on every page load.
 *
 * **Why this split** : free-tier providers (FMP 250 req/jour) are quota-bound. The pre-v0.4
 * behaviour re-hit the provider on every panel tweak ; v0.4 isolates the live fetch behind an
 * explicit user action and serves all subsequent reads from the persisted snapshot. The filter
 * itself runs client-side (signal + computed) so panel tweaks cost zero HTTP — see ticket (9) Q2
 * decision (2026-05-29).
 *
 * **Market timezone** : snapshots are keyed on the ET market day (`America/New_York`). A refresh at
 * 11pm Pacific = 2am ET (next day) lands on the next ET row — which is the right semantics for the
 * Nasdaq pre-market session.
 *
 * **Empty snapshot is valid** — when no row exists yet for the active provider, [loadSnapshot]
 * returns an envelope with `date = null` + `fetchedAt = null` + empty movers list. The UI renders
 * the "press Rechercher to amorcer" empty state. No exception thrown in that path.
 */
@Service
class MarketScreenerService(
  private val client: MarketScreenerClient,
  private val repository: ScreenerSnapshotRepository,
  private val appConfig: AppConfigService,
  private val jsonMapper: ObjectMapper,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  // Captured once at class init — Jackson reflects on this token to know the generic shape on read.
  private val moversTypeRef = object : TypeReference<List<TickerMoverDto>>() {}

  /**
   * Fetch + persist + return path. UPSERTs the `(date, provider)` row : a second refresh the same
   * day overwrites the earlier one (single-user, no intra-day history kept). The provider name is
   * read from [AppConfigService] *before* the fetch so a runtime provider switch mid-call lands the
   * snapshot under the provider that actually served it.
   *
   * Throws [com.portfolioai.shared.UpstreamUnavailableException] when the adapter errors —
   * propagated to the controller, mapped to HTTP 503 by `GlobalExceptionHandler`. No DB write on
   * that path.
   */
  @Transactional
  fun refresh(
    universe: ScreenerUniverse = ScreenerUniverse.US_SMALL_CAP_GAPPERS
  ): ScreenerSnapshotResponse {
    val provider = appConfig.getString(ConfigKeys.SCREENER_PROVIDER)
    log.info("Screener refresh start provider={} universe={}", provider, universe)
    val movers = client.snapshotMovers(universe)
    val moversDto = movers.map { it.toDto() }
    val today = LocalDate.now(MARKET_ZONE)
    val json = jsonMapper.writeValueAsString(moversDto)
    val saved =
      repository.save(ScreenerSnapshotDay(date = today, provider = provider, moversJson = json))
    log.info(
      "Screener refresh persisted date={} provider={} moverCount={} fetchedAt={}",
      saved.date,
      saved.provider,
      moversDto.size,
      saved.fetchedAt,
    )
    return ScreenerSnapshotResponse(
      date = saved.date,
      provider = saved.provider,
      fetchedAt = saved.fetchedAt,
      movers = moversDto,
    )
  }

  /**
   * Read path. With [date] = null returns the most recent persisted snapshot for the active
   * provider ; with an explicit [date] returns that exact row (or the empty envelope when nothing
   * was persisted that day).
   */
  fun loadSnapshot(date: LocalDate? = null): ScreenerSnapshotResponse {
    val provider = appConfig.getString(ConfigKeys.SCREENER_PROVIDER)
    val row =
      when (date) {
        null -> repository.findFirstByProviderOrderByDateDesc(provider)
        else -> repository.findByDateAndProvider(date, provider)
      }
    if (row == null) {
      log.debug("Screener load — no persisted snapshot for provider={} date={}", provider, date)
      return ScreenerSnapshotResponse(
        date = null,
        provider = provider,
        fetchedAt = null,
        movers = emptyList(),
      )
    }
    val movers: List<TickerMoverDto> = jsonMapper.readValue(row.moversJson, moversTypeRef)
    return ScreenerSnapshotResponse(
      date = row.date,
      provider = row.provider,
      fetchedAt = row.fetchedAt,
      movers = movers,
    )
  }

  private companion object {
    /** ET market day — handles DST automatically. */
    val MARKET_ZONE: ZoneId = ZoneId.of("America/New_York")
  }
}
