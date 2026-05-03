package com.portfolioai.market.infrastructure.http

import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.Timeframe
import com.portfolioai.shared.GlobalExceptionHandler
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

/**
 * `@WebMvcTest` slice for the [MarketController] dossier endpoints. The dossier itself (`GET
 * /{symbol}`) is covered by the front-end e2e flow ; this slice focuses on the new multi-timeframe
 * chart endpoint, where the contract details (timeframe whitelist, default value, symbol
 * normalisation) matter and a regression would silently break the chart toggle UI.
 *
 * What we pin :
 * - **`?timeframe`** is whitelisted via [Timeframe] — unknown codes return HTTP 400 (not 500), so
 *   the front can show a friendly error rather than crash. Defends the cache key from unbounded
 *   strings.
 * - **Symbol is uppercased** in the response, even when the URL came in lowercase. Matches what
 *   `TickerService.load` does on the dossier path so cache lookups stay consistent.
 * - **Provider exceptions surface as 404 / 503** via the [GlobalExceptionHandler] : the chart
 *   endpoint must propagate `NoSuchElementException` (unknown ticker) and
 *   `MarketUnavailableException` (rate-limit / upstream) the same way the dossier does, otherwise
 *   the chart toggle would mask real failures behind a generic 500.
 * - **Default `?timeframe=1y`** equals the dossier's reference view, so an URL without any query
 *   param yields the same series the dossier already shows on initial load.
 */
@WebMvcTest(MarketController::class, GlobalExceptionHandler::class)
class MarketControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var tickerService: TickerService

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `GET chart returns bars and echoes timeframe metadata for a known timeframe`() {
    given(tickerService.loadBars(eq("AAPL"), eq(Timeframe.ONE_MONTH))).willReturn(twoBars())

    mvc
      .perform(get("/api/market/ticker/AAPL/chart").param("timeframe", "1mo"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("AAPL"))
      .andExpect(jsonPath("$.timeframe").value("1mo"))
      // Echo back what the upstream actually got — useful for the front when debugging cache hits.
      .andExpect(jsonPath("$.range").value("1mo"))
      .andExpect(jsonPath("$.interval").value("1day"))
      .andExpect(jsonPath("$.bars.length()").value(2))
      .andExpect(jsonPath("$.bars[0].close").value(102.5))
  }

  @Test
  fun `GET chart defaults to timeframe=1y when the query param is omitted`() {
    // The dossier endpoint also serves 1Y daily as its reference view, so an URL without
    // ?timeframe must equal what's already drawn on initial load — no surprise on first paint.
    given(tickerService.loadBars(eq("AAPL"), eq(Timeframe.ONE_YEAR))).willReturn(twoBars())

    mvc
      .perform(get("/api/market/ticker/AAPL/chart"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.timeframe").value("1y"))
      .andExpect(jsonPath("$.range").value("1y"))
      .andExpect(jsonPath("$.interval").value("1day"))
  }

  @Test
  fun `GET chart uppercases the symbol in the response`() {
    // The user-facing URL might come in lowercase ; the response should always show the canonical
    // uppercase form so the front displays it consistently across pages.
    given(tickerService.loadBars(any(), any())).willReturn(twoBars())

    mvc
      .perform(get("/api/market/ticker/aapl/chart"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("AAPL"))
  }

  // ---------------------------------------------------------------------- error paths

  @Test
  fun `GET chart returns 400 when timeframe is unknown`() {
    // Defends the Caffeine cache key from unbounded values — without this guard the user could
    // burn cache entries with `timeframe=anything-they-type`.
    mvc
      .perform(get("/api/market/ticker/AAPL/chart").param("timeframe", "42years"))
      .andExpect(status().isBadRequest)
      .andExpect(jsonPath("$.error").exists())
      // Message must mention the offending code — helps the front surface a useful error.
      .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("42years")))
  }

  @Test
  fun `GET chart returns 404 when the ticker is unknown`() {
    given(tickerService.loadBars(any(), any()))
      .willThrow(NoSuchElementException("Ticker XYZ not found on Twelve Data"))

    mvc
      .perform(get("/api/market/ticker/XYZ/chart").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET chart returns 503 when the provider is unavailable`() {
    // Rate-limit, upstream 5xx, network unreachable… all surface as 503 to differentiate from a
    // genuine 500 (our bug) and tell the front "retry in a few minutes".
    given(tickerService.loadBars(any(), any()))
      .willThrow(MarketUnavailableException("rate-limited"))

    mvc
      .perform(get("/api/market/ticker/AAPL/chart"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  // ---------------------------------------------------------------------- helpers

  private fun twoBars(): List<OhlcBar> {
    val t0 = Instant.parse("2026-04-15T00:00:00Z")
    val t1 = Instant.parse("2026-04-16T00:00:00Z")
    return listOf(
      OhlcBar(
        timestamp = t0,
        open = BigDecimal("100.00"),
        high = BigDecimal("103.00"),
        low = BigDecimal("99.50"),
        close = BigDecimal("102.50"),
        volume = 1_500_000L,
      ),
      OhlcBar(
        timestamp = t1,
        open = BigDecimal("102.50"),
        high = BigDecimal("105.00"),
        low = BigDecimal("101.00"),
        close = BigDecimal("104.50"),
        volume = 1_800_000L,
      ),
    )
  }
}
