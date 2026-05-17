package com.portfolioai.news.infrastructure.http

import com.portfolioai.news.application.NewsService
import com.portfolioai.news.domain.NewsItem
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.shared.UpstreamUnavailableException
import java.time.Instant
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
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
 * `@WebMvcTest` slice for the `/news` endpoint of [NewsController]. Pins the bits that a refactor
 * could silently break :
 * - **URL shape** — `GET /api/market/ticker/{symbol}/news` lives under the same prefix as the other
 *   ticker endpoints (`/`, `/chart`, `/narrative/...`). Front composes calls naturally.
 * - **`limit` query param** with a sensible default (10) — front can pass anything from 1 to 100,
 *   the service caps before calling upstream.
 * - **JSON shape** — list of `{id, symbol, headline, summary, source, url, imageUrl, publishedAt,
 *   category}`. The front depends on this exact field set.
 * - **Provider errors surface as 503** via [GlobalExceptionHandler] (`UpstreamUnavailableException`
 *   is the shared exception between Twelve Data and Finnhub adapters — both map to 503).
 */
@WebMvcTest(NewsController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class NewsControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: NewsService

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `GET news returns the list of headlines`() {
    given(service.forSymbol(eq("AAPL"), any()))
      .willReturn(listOf(item("Apple launches X"), item("Apple Q4 earnings")))

    mvc
      .perform(get("/api/market/ticker/AAPL/news"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(2))
      .andExpect(jsonPath("$[0].headline").value("Apple launches X"))
      .andExpect(jsonPath("$[0].symbol").value("AAPL"))
      .andExpect(jsonPath("$[0].source").value("Reuters"))
      .andExpect(jsonPath("$[0].url").value("https://example.com/a"))
      .andExpect(jsonPath("$[0].publishedAt").exists())
  }

  @Test
  fun `GET news passes the limit query param to the service`() {
    given(service.forSymbol(any(), eq(5))).willReturn(emptyList())

    mvc.perform(get("/api/market/ticker/AAPL/news").param("limit", "5")).andExpect(status().isOk)
  }

  @Test
  fun `GET news defaults limit to 10 when omitted`() {
    given(service.forSymbol(any(), eq(10))).willReturn(emptyList())

    mvc.perform(get("/api/market/ticker/AAPL/news")).andExpect(status().isOk)
  }

  // ---------------------------------------------------------------------- error path

  @Test
  fun `GET news returns 503 when the upstream is unavailable`() {
    // Finnhub rate-limit / 5xx / unreachable — all bubble up as UpstreamUnavailableException.
    // The dossier renders an inline error in the news panel without breaking the rest of the
    // page (chart, indicators, narrative stay visible).
    given(service.forSymbol(any(), any())).willThrow(UpstreamUnavailableException("rate-limited"))

    mvc
      .perform(get("/api/market/ticker/AAPL/news"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  // ---------------------------------------------------------------------- helpers

  private fun item(headline: String): NewsItem =
    NewsItem(
      id = "1",
      symbol = "AAPL",
      headline = headline,
      summary = "Some summary",
      source = "Reuters",
      url = "https://example.com/a",
      imageUrl = null,
      publishedAt = Instant.parse("2026-05-03T10:00:00Z"),
      category = "company news",
    )
}
