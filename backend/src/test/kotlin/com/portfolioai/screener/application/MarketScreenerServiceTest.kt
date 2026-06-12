package com.portfolioai.screener.application

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.application.dto.TickerMoverDto
import com.portfolioai.screener.application.dto.toDto
import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerSnapshotDay
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import com.portfolioai.screener.infrastructure.persistence.ScreenerSnapshotRepository
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Refresh / read split for the market radar after Phase 6 ticket (9). The service is the only layer
 * that touches both the live adapter (via [MarketScreenerClient]) and the persisted snapshot
 * (`screener_snapshot_day`) — a regression here would either (a) re-burn quota on every page load
 * (read path accidentally calling the adapter) or (b) silently land the snapshot under the wrong
 * provider (UPSERT key misaligned with the active provider name).
 *
 * Each test pins one slice : the persist side-effect of refresh, the provider tagging, the
 * upstream-blip propagation, the per-provider scoping of the read, and the empty envelope returned
 * when no snapshot exists yet. The dynamic filter (gap %, volume ratio…) was removed from the
 * service in v0.4 — it now runs client-side in the radar page.
 *
 * Stubbed dependencies — adapter ([StubScreenerClient]), repository (Mockito), [AppConfigService]
 * (Mockito for the single key lookup). A real [ObjectMapper] is used because the JSON round-trip
 * through `moversJson` is part of the contract under test — a Jackson regression on `BigDecimal` or
 * `Instant` would slip past a mocked mapper.
 */
class MarketScreenerServiceTest {

  private val objectMapper: ObjectMapper =
    jacksonObjectMapper().registerKotlinModule().registerModule(JavaTimeModule())

  @Test
  fun `refresh fetches the active provider snapshot and persists it under that provider key`() {
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.save(any<ScreenerSnapshotDay>())).thenAnswer {
      it.arguments[0] as ScreenerSnapshotDay
    }
    val service =
      serviceWith(
        client = StubScreenerClient(listOf(sampleMover("RDDT"))),
        repo = repo,
        activeProvider = ConfigKeys.PROVIDER_FMP,
      )

    val response = service.refresh()

    verify(repo, times(1)).save(any<ScreenerSnapshotDay>())
    assertEquals(ConfigKeys.PROVIDER_FMP, response.provider)
    assertEquals(1, response.movers.size)
    assertEquals("RDDT", response.movers.first().symbol)
  }

  @Test
  fun `refresh keys the snapshot on today's ET market date`() {
    // ET market timezone — clock-skew across the runner shouldn't change the date the snapshot is
    // tagged with. We assert on the property `the persisted date matches today in NY` instead of
    // freezing time, because the service grabs `LocalDate.now(ZoneId)` directly.
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.save(any<ScreenerSnapshotDay>())).thenAnswer {
      it.arguments[0] as ScreenerSnapshotDay
    }
    val service = serviceWith(repo = repo)
    val expectedDate = LocalDate.now(ZoneId.of("America/New_York"))

    val response = service.refresh()

    assertEquals(expectedDate, response.date)
  }

  @Test
  fun `refresh propagates the upstream blip and does not persist`() {
    val failingClient = StubScreenerClient.throwing(UpstreamUnavailableException("rate-limited"))
    val repo: ScreenerSnapshotRepository = mock()
    val service = serviceWith(client = failingClient, repo = repo)

    assertThrows(UpstreamUnavailableException::class.java) { service.refresh() }
    verify(repo, times(0)).save(any<ScreenerSnapshotDay>())
  }

  @Test
  fun `loadSnapshot null date returns the most recent persisted row for the active provider`() {
    val repo: ScreenerSnapshotRepository = mock()
    val expectedDate = LocalDate.of(2026, 5, 29)
    whenever(repo.findFirstByProviderOrderByDateDesc(ConfigKeys.PROVIDER_FMP))
      .thenReturn(persistedSnapshot(expectedDate, ConfigKeys.PROVIDER_FMP, listOf("NEW")))
    val service = serviceWith(repo = repo, activeProvider = ConfigKeys.PROVIDER_FMP)

    val response = service.loadSnapshot(date = null)

    assertEquals(expectedDate, response.date)
    assertEquals(listOf("NEW"), response.movers.map { it.symbol })
    verify(repo, times(1)).findFirstByProviderOrderByDateDesc(ConfigKeys.PROVIDER_FMP)
  }

  @Test
  fun `loadSnapshot scopes the latest-row lookup to the active provider`() {
    // A polygon snapshot must NOT surface when the active provider is FMP — the read path is
    // per-provider so a runtime switch doesn't silently serve another provider's data.
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.findFirstByProviderOrderByDateDesc(ConfigKeys.PROVIDER_FMP))
      .thenReturn(
        persistedSnapshot(LocalDate.of(2026, 5, 27), ConfigKeys.PROVIDER_FMP, listOf("FMP"))
      )
    val service = serviceWith(repo = repo, activeProvider = ConfigKeys.PROVIDER_FMP)

    service.loadSnapshot(date = null)

    verify(repo, times(1)).findFirstByProviderOrderByDateDesc(eq(ConfigKeys.PROVIDER_FMP))
  }

  @Test
  fun `loadSnapshot with explicit date returns that exact row when it exists`() {
    val targetDate = LocalDate.of(2026, 5, 27)
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.findByDateAndProvider(targetDate, ConfigKeys.PROVIDER_FMP))
      .thenReturn(persistedSnapshot(targetDate, ConfigKeys.PROVIDER_FMP, listOf("HIT")))
    val service = serviceWith(repo = repo, activeProvider = ConfigKeys.PROVIDER_FMP)

    val response = service.loadSnapshot(date = targetDate)

    assertEquals(targetDate, response.date)
    assertEquals(listOf("HIT"), response.movers.map { it.symbol })
  }

  @Test
  fun `loadSnapshot returns empty envelope when no row exists for the active provider`() {
    // First-time visit, no « Rechercher » press yet — the UI uses `fetchedAt == null` to render the
    // « clique sur Rechercher » empty state. Throwing or returning 404 would force the frontend
    // into error-handling for a normal cold-start state.
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.findFirstByProviderOrderByDateDesc(any())).thenReturn(null)
    val service = serviceWith(repo = repo, activeProvider = ConfigKeys.PROVIDER_FMP)

    val response = service.loadSnapshot(date = null)

    assertNull(response.date)
    assertNull(response.fetchedAt)
    assertEquals(ConfigKeys.PROVIDER_FMP, response.provider)
    assertTrue(response.movers.isEmpty())
  }

  @Test
  fun `loadSnapshot returns empty envelope when the explicit date has no row`() {
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.findByDateAndProvider(any(), any())).thenReturn(null)
    val service = serviceWith(repo = repo, activeProvider = ConfigKeys.PROVIDER_FMP)

    val response = service.loadSnapshot(date = LocalDate.of(2025, 1, 1))

    assertNull(response.date)
    assertTrue(response.movers.isEmpty())
  }

  @Test
  fun `refresh response carries the fetchedAt timestamp returned by the repository`() {
    val fixedInstant = Instant.parse("2026-05-29T14:32:00Z")
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.save(any<ScreenerSnapshotDay>())).thenAnswer {
      val arg = it.arguments[0] as ScreenerSnapshotDay
      ScreenerSnapshotDay(arg.date, arg.provider, arg.moversJson, fetchedAt = fixedInstant)
    }
    val service = serviceWith(repo = repo)

    val response = service.refresh()

    assertNotNull(response.fetchedAt)
    assertEquals(fixedInstant, response.fetchedAt)
  }

  @Test
  fun `refresh persists movers raw without float-premarket enrichment`() {
    // Post-pivot the radar only shows price + gap : the float / premarket enrichment was dropped
    // (FMP's float is stale on the dilution-heavy small-caps the radar targets — misleading data).
    // A mover that would once have been enriched now lands in the snapshot exactly as the adapter
    // returned it — float / premarket stay whatever the adapter set (null here).
    val candidate =
      sampleMover("GNS").copy(price = BigDecimal("5.00"), gapPct = BigDecimal("60.00"))
    val service = serviceWith(client = StubScreenerClient(listOf(candidate)))

    val response = service.refresh()

    assertNull(response.movers.first().floatShares)
    assertNull(response.movers.first().premarketVolume)
  }

  // --- Helpers
  // ------------------------------------------------------------------------------------

  private fun serviceWith(
    client: MarketScreenerClient = StubScreenerClient(listOf(sampleMover("RDDT"))),
    repo: ScreenerSnapshotRepository = passthroughRepo(),
    activeProvider: String = ConfigKeys.PROVIDER_MOCK,
  ): MarketScreenerService {
    val appConfig: AppConfigService = mock()
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER)).thenReturn(activeProvider)
    return MarketScreenerService(
      client = client,
      repository = repo,
      appConfig = appConfig,
      jsonMapper = objectMapper,
    )
  }

  private fun passthroughRepo(): ScreenerSnapshotRepository {
    val repo: ScreenerSnapshotRepository = mock()
    whenever(repo.save(any<ScreenerSnapshotDay>())).thenAnswer {
      it.arguments[0] as ScreenerSnapshotDay
    }
    return repo
  }

  /** Builds a `ScreenerSnapshotDay` with a serialised payload, simulating a freshly-read DB row. */
  private fun persistedSnapshot(
    date: LocalDate,
    provider: String,
    symbols: List<String>,
  ): ScreenerSnapshotDay {
    val dtos: List<TickerMoverDto> = symbols.map { sampleMover(it).toDto() }
    return ScreenerSnapshotDay(
      date = date,
      provider = provider,
      moversJson = objectMapper.writeValueAsString(dtos),
      fetchedAt = Instant.now(),
    )
  }

  private fun sampleMover(symbol: String): TickerMover =
    TickerMover(
      symbol = symbol,
      name = "$symbol Inc.",
      price = BigDecimal("100.00"),
      previousClose = BigDecimal("90.00"),
      gapPct = BigDecimal("11.11"),
      volume = 10_000_000L,
      volumeAvg30d = 2_000_000L,
      volumeRatio = BigDecimal("5.00"),
      marketCapUsd = 5_000_000_000L,
      exchange = "NASDAQ",
      sector = "Technology",
    )

  private class StubScreenerClient(
    private val snapshot: List<TickerMover>,
    private val toThrow: RuntimeException? = null,
  ) : MarketScreenerClient {
    override fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover> {
      toThrow?.let { throw it }
      return snapshot
    }

    companion object {
      fun throwing(ex: RuntimeException) = StubScreenerClient(emptyList(), toThrow = ex)
    }
  }
}
