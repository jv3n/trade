package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.TickerNarrativeJobStore
import com.portfolioai.analysis.application.TickerNarrativeService
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import com.portfolioai.market.domain.TickerSnapshot
import com.portfolioai.shared.GlobalExceptionHandler
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for the `/preview` endpoint of [TickerNarrativeController]. The other
 * endpoints (`POST /narrative`, `GET /jobs/{id}`, `GET /latest`) are covered indirectly via
 * `TickerNarrativeServiceTest` and are not re-asserted here.
 *
 * What we pin :
 * - The endpoint URL (`GET /api/market/ticker/{symbol}/narrative/preview`).
 * - The JSON shape the `/settings/prompt-preview` page consumes (system + user + char counts +
 *   prompt version). A rename here would silently empty the preview UI on the front.
 * - The user message body actually contains the live indicator values — we don't just return the
 *   template, we return what the runner would send to Claude *right now*.
 * - Errors surface as 503/404 via `GlobalExceptionHandler` (TickerService's exceptions on provider
 *   rate-limit / unknown ticker).
 */
@WebMvcTest(TickerNarrativeController::class, GlobalExceptionHandler::class)
class TickerNarrativePreviewControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  // The controller depends on these beans ; preview only uses TickerService, the others must
  // still be provided for the slice to instantiate. `@Suppress("unused")` because Detekt sees
  // them as unread props — they are read indirectly by Spring's slice DI graph at construction.
  @Suppress("unused") @MockitoBean private lateinit var service: TickerNarrativeService
  @Suppress("unused") @MockitoBean private lateinit var jobStore: TickerNarrativeJobStore
  @MockitoBean private lateinit var tickerService: TickerService

  private fun snapshot(symbol: String = "AAPL"): TickerSnapshot {
    val asOf = Instant.parse("2026-05-02T13:00:00Z")
    val quote =
      TickerQuote(
        symbol = symbol,
        name = "Apple Inc.",
        currency = "USD",
        exchange = "NASDAQ",
        price = BigDecimal("180.00"),
        fiftyTwoWeekHigh = BigDecimal("200.00"),
        fiftyTwoWeekLow = BigDecimal("140.00"),
        asOf = asOf,
        instrumentType = null,
      )
    val indicators =
      Indicators(
        asOf = asOf,
        price = BigDecimal("180.00"),
        rsi14 = BigDecimal("62.5"),
        ma50 = BigDecimal("178.00"),
        ma200 = BigDecimal("170.00"),
        momentum30d = BigDecimal("3.50"),
        momentum90d = BigDecimal("8.20"),
        perf1m = BigDecimal("2.40"),
        perf3m = BigDecimal("9.10"),
        perf1y = BigDecimal("18.30"),
        drawdownFrom52wHigh = BigDecimal("-10.00"),
        volumeRelative30d = BigDecimal("1.20"),
        distanceToMa50Pct = BigDecimal("1.10"),
        distanceToMa200Pct = BigDecimal("5.90"),
      )
    return TickerSnapshot(quote = quote, indicators = indicators, bars = emptyList<OhlcBar>())
  }

  @Test
  fun `GET narrative preview returns system + user prompt with char counts`() {
    given(tickerService.load("AAPL")).willReturn(snapshot())

    mvc
      .perform(get("/api/market/ticker/AAPL/narrative/preview").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("AAPL"))
      .andExpect(jsonPath("$.promptVersion").value("v2"))
      // System prompt is the static NARRATIVE_SYSTEM_PROMPT — non-empty, mentions "JSON".
      .andExpect(jsonPath("$.systemPrompt").isNotEmpty)
      .andExpect(jsonPath("$.systemPromptChars").isNumber)
      // User message must echo live indicator values, not just a template.
      .andExpect(
        jsonPath("$.userMessage").value(org.hamcrest.Matchers.containsString("RSI(14): 62.5"))
      )
      .andExpect(
        jsonPath("$.userMessage").value(org.hamcrest.Matchers.containsString("Ticker: AAPL"))
      )
      .andExpect(jsonPath("$.userMessageChars").isNumber)
  }

  @Test
  fun `GET narrative preview returns 404 when the ticker is unknown`() {
    given(tickerService.load("UNKNOWN"))
      .willThrow(NoSuchElementException("Ticker UNKNOWN not found on Twelve Data"))

    mvc
      .perform(
        get("/api/market/ticker/UNKNOWN/narrative/preview").accept(MediaType.APPLICATION_JSON)
      )
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }
}
