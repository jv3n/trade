package com.portfolioai.screener.infrastructure.http

import com.portfolioai.screener.application.MarketScreenerService
import com.portfolioai.screener.application.dto.ScreenerSnapshotResponse
import com.portfolioai.screener.application.dto.TickerMoverDto
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.verify
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [MarketScreenerController] post Phase 6 ticket (9). Pins :
 * - **Two endpoints, distinct semantics** — `POST /api/screener/refresh` triggers a live fetch +
 *   persist ; `GET /api/screener/movers` reads the persisted snapshot. Confusing the two would
 *   either burn provider quota on every page load (the regression we shipped to avoid) or never
 *   refresh at all.
 * - **JSON envelope shape** — both endpoints return [ScreenerSnapshotResponse] with `date`,
 *   `provider`, `fetchedAt`, `movers`. The frontend reads `fetchedAt == null` as the "press
 *   Rechercher" empty state, so the controller mustn't 404 or 204 on cold start.
 * - **Date query param parsing** — `?date=YYYY-MM-DD` maps to [LocalDate] via Spring's
 *   `@DateTimeFormat`. Mis-parsing would either silently drop the date filter or 400.
 * - **Upstream blip on refresh → 503** via the global exception handler, consistent with the rest
 *   of the provider-backed endpoints (news, analyst, earnings).
 */
@WebMvcTest(MarketScreenerController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class MarketScreenerControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: MarketScreenerService

  @Test
  fun `POST refresh returns the envelope with date provider fetchedAt and movers`() {
    given(service.refresh()).willReturn(sampleResponse(symbols = listOf("RDDT")))

    mvc
      .perform(post("/api/screener/refresh"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.date").value("2026-05-29"))
      .andExpect(jsonPath("$.provider").value("fmp"))
      .andExpect(jsonPath("$.fetchedAt").exists())
      .andExpect(jsonPath("$.movers.length()").value(1))
      .andExpect(jsonPath("$.movers[0].symbol").value("RDDT"))
      .andExpect(jsonPath("$.movers[0].gapPct").value(16.67))
  }

  @Test
  fun `POST refresh returns 503 when the upstream provider is unavailable`() {
    given(service.refresh()).willThrow(UpstreamUnavailableException("rate-limited"))

    mvc
      .perform(post("/api/screener/refresh"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET movers without date delegates to loadSnapshot with null date`() {
    given(service.loadSnapshot(null)).willReturn(sampleResponse(symbols = listOf("RDDT")))

    mvc
      .perform(get("/api/screener/movers"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.movers.length()").value(1))

    verify(service).loadSnapshot(eq(null))
  }

  @Test
  fun `GET movers parses the date query param into a LocalDate`() {
    val targetDate = LocalDate.of(2026, 5, 27)
    given(service.loadSnapshot(targetDate))
      .willReturn(sampleResponse(date = targetDate, symbols = listOf("HIT")))

    mvc
      .perform(get("/api/screener/movers").param("date", "2026-05-27"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.date").value("2026-05-27"))
      .andExpect(jsonPath("$.movers[0].symbol").value("HIT"))

    verify(service).loadSnapshot(eq(targetDate))
  }

  @Test
  fun `GET movers returns the empty envelope when no snapshot is persisted yet`() {
    // Cold start — no « Rechercher » press, no row. The endpoint must return 200 with null date /
    // fetchedAt + empty movers, not 404 — the UI uses these to render the "press Rechercher" hint.
    given(service.loadSnapshot(null))
      .willReturn(
        ScreenerSnapshotResponse(
          date = null,
          provider = "fmp",
          fetchedAt = null,
          movers = emptyList(),
        )
      )

    mvc
      .perform(get("/api/screener/movers"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.date").doesNotExist()) // Jackson default — nulls omitted
      .andExpect(jsonPath("$.provider").value("fmp"))
      .andExpect(jsonPath("$.movers.length()").value(0))
  }

  @Test
  fun `GET movers preserves the order returned by the service`() {
    // The frontend sorts by gapPct desc client-side, but the service already returns the raw list
    // in the order the provider gave it — the controller must not shuffle. Pin the order here.
    val response = sampleResponse(symbols = listOf("AAA", "BBB", "CCC"))
    given(service.loadSnapshot(null)).willReturn(response)

    mvc
      .perform(get("/api/screener/movers"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.movers[0].symbol").value("AAA"))
      .andExpect(jsonPath("$.movers[1].symbol").value("BBB"))
      .andExpect(jsonPath("$.movers[2].symbol").value("CCC"))
  }

  @Test
  fun `GET movers with malformed date returns 400`() {
    // Spring's `@DateTimeFormat` strict parsing rejects anything that isn't ISO YYYY-MM-DD. The
    // route must surface that as a 400 rather than silently treating it as null (which would serve
    // the latest snapshot under a wrong impression of "the date filter took").
    mvc
      .perform(get("/api/screener/movers").param("date", "not-a-date"))
      .andExpect(status().isBadRequest)

    val zeroCalls = 0
    assertEquals(zeroCalls, org.mockito.Mockito.mockingDetails(service).invocations.size)
  }

  // --- Helpers
  // ------------------------------------------------------------------------------------

  private fun sampleResponse(
    date: LocalDate = LocalDate.of(2026, 5, 29),
    symbols: List<String> = listOf("RDDT"),
  ): ScreenerSnapshotResponse =
    ScreenerSnapshotResponse(
      date = date,
      provider = "fmp",
      fetchedAt = Instant.parse("2026-05-29T14:32:00Z"),
      movers = symbols.map { sampleMover(it) },
    )

  private fun sampleMover(symbol: String): TickerMoverDto =
    TickerMoverDto(
      symbol = symbol,
      name = "$symbol Inc.",
      price = BigDecimal("78.40"),
      previousClose = BigDecimal("67.20"),
      gapPct = BigDecimal("16.67"),
      volume = 24_500_000L,
      volumeAvg30d = 6_000_000L,
      volumeRatio = BigDecimal("4.08"),
      marketCapUsd = 9_800_000_000L,
      exchange = "NASDAQ",
      sector = "Communication Services",
    )
}
