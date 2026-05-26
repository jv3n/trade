package com.portfolioai.screener.infrastructure.http

import com.portfolioai.screener.application.MarketScreenerService
import com.portfolioai.screener.domain.ScreenerFilter
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [MarketScreenerController]. Pins :
 * - **URL + JSON shape** — `GET /api/screener/movers` returns a JSON array of mover rows (one per
 *   ticker matching the filter), with the columns the `/radar` table renders.
 * - **Query-param wiring** — the filter knobs surfaced by the page (gap %, volume ratio, optional
 *   cap range, exchange, sector) flow into a [ScreenerFilter] passed to the service.
 * - **Empty result is 200 OK with `[]`** — empty is a valid state ("nothing abnormal right now"),
 *   not an error.
 * - **Upstream blip → 503** via the global exception handler, consistent with the rest of the
 *   provider-backed endpoints (news, analyst, earnings).
 */
@WebMvcTest(MarketScreenerController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class MarketScreenerControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: MarketScreenerService

  @Test
  fun `GET movers returns a list of TickerMoverDto with the default filter`() {
    given(service.findMovers(any(), any())).willReturn(listOf(sampleMover()))

    mvc
      .perform(get("/api/screener/movers"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(1))
      .andExpect(jsonPath("$[0].symbol").value("RDDT"))
      .andExpect(jsonPath("$[0].name").value("Reddit Inc."))
      .andExpect(jsonPath("$[0].price").value(78.40))
      .andExpect(jsonPath("$[0].previousClose").value(67.20))
      .andExpect(jsonPath("$[0].gapPct").value(16.67))
      .andExpect(jsonPath("$[0].volume").value(24500000))
      .andExpect(jsonPath("$[0].volumeAvg30d").value(6000000))
      .andExpect(jsonPath("$[0].volumeRatio").value(4.08))
      .andExpect(jsonPath("$[0].marketCapUsd").value(9800000000L))
      .andExpect(jsonPath("$[0].exchange").value("NASDAQ"))
      .andExpect(jsonPath("$[0].sector").value("Communication Services"))
  }

  @Test
  fun `GET movers without query params uses the v1 defaults gapPctMin=5 and volumeRatioMin=3`() {
    // The defaults must match the Phase 6 kick-off decision — a caller that omits the params
    // shouldn't accidentally land an empty radar because the floors were too aggressive.
    given(service.findMovers(any(), any())).willReturn(emptyList())

    mvc.perform(get("/api/screener/movers")).andExpect(status().isOk)

    val applied = captureFilter()
    assertEquals(0, applied.gapPctMin.compareTo(BigDecimal("5.0")))
    assertEquals(0, applied.volumeRatioMin.compareTo(BigDecimal("3.0")))
    assertNull(applied.marketCapMin)
    assertNull(applied.marketCapMax)
    assertNull(applied.exchange)
    assertNull(applied.sector)
  }

  @Test
  fun `GET movers propagates custom query params into the filter`() {
    given(service.findMovers(any(), any())).willReturn(emptyList())

    mvc
      .perform(
        get("/api/screener/movers")
          .param("gapPctMin", "10.0")
          .param("volumeRatioMin", "5.0")
          .param("marketCapMin", "3000000000")
          .param("marketCapMax", "8000000000")
          .param("exchange", "NASDAQ")
          .param("sector", "Technology")
      )
      .andExpect(status().isOk)

    val applied = captureFilter()
    assertEquals(0, applied.gapPctMin.compareTo(BigDecimal("10.0")))
    assertEquals(0, applied.volumeRatioMin.compareTo(BigDecimal("5.0")))
    assertEquals(3_000_000_000L, applied.marketCapMin)
    assertEquals(8_000_000_000L, applied.marketCapMax)
    assertEquals("NASDAQ", applied.exchange)
    assertEquals("Technology", applied.sector)
  }

  @Test
  fun `GET movers returns 200 with empty array when nothing matches`() {
    // Empty radar must not 404 — the UI distinguishes "calm market, nothing to surface" (200 OK
    // with []) from "upstream broken" (503).
    given(service.findMovers(any(), any())).willReturn(emptyList())

    mvc
      .perform(get("/api/screener/movers"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(0))
  }

  @Test
  fun `GET movers returns 503 when the upstream provider is unavailable`() {
    given(service.findMovers(any(), any())).willThrow(UpstreamUnavailableException("rate-limited"))

    mvc
      .perform(get("/api/screener/movers"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  // ---------------------------------------------------------------------- helpers

  private fun captureFilter(): ScreenerFilter {
    val filterCaptor = argumentCaptor<ScreenerFilter>()
    verify(service).findMovers(eq(ScreenerUniverse.NASDAQ_MID_CAP), filterCaptor.capture())
    return filterCaptor.firstValue
  }

  private fun sampleMover(): TickerMover =
    TickerMover(
      symbol = "RDDT",
      name = "Reddit Inc.",
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
