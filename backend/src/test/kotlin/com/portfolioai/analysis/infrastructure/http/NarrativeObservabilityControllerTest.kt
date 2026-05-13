package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.NarrativeObservabilityService
import com.portfolioai.analysis.application.dto.NarrativeObservationDto
import com.portfolioai.analysis.application.dto.NarrativeObservationsResponse
import com.portfolioai.analysis.application.dto.TickerObservationIndexDto
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.shared.GlobalExceptionHandler
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.isNull
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice on [NarrativeObservabilityController] — Phase 3 #1 timeline endpoint. The
 * wire shape pinned here is what the `/observability/:symbol` page consumes, so a JSON field rename
 * here would silently break the frontend.
 *
 * What we pin :
 *
 * - **Default request** : just `GET /api/narrative/observability/{symbol}` forwards all filters as
 *   null and returns the wrapped response. Symbol normalisation is a *service-layer* concern, the
 *   controller passes it through verbatim — pinned so a future refactor doesn't accidentally
 *   uppercase the path variable here too and surprise the service tests.
 * - **Optional filters** `from`, `to`, `promptId` round-trip from query string → service args. The
 *   page's filter UI builds this URL ; an unintentional rename of `promptId` to `promptTemplateId`
 *   (the internal Kotlin name) would break the page silently.
 * - **Date binding** uses ISO 8601 (`@DateTimeFormat(iso = DATE_TIME)`). Pinned so a future
 *   tightening of `--strict-mode` on Jackson can't reject the values the frontend sends.
 * - **Empty response shape** : `observations: []` not absent, so the page can render an empty state
 *   without juggling the `undefined` case in TS.
 * - **Wire JSON for one observation** : all critical fields (snapshotId, generatedAt, summary,
 *   sentiment, keyPoints, promptName, promptTemplateVersion, thumbsValue, priceAt*, delta*) make it
 *   into the body. A rename here cascades into the Angular page binding silently.
 */
@WebMvcTest(NarrativeObservabilityController::class, GlobalExceptionHandler::class)
class NarrativeObservabilityControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: NarrativeObservabilityService

  // ---------------------------------------------------------------------- default request

  @Test
  fun `GET observability forwards all filters as null when none are provided`() {
    given(service.findFor(eq("NVDA"), isNull(), isNull(), isNull()))
      .willReturn(NarrativeObservationsResponse(symbol = "NVDA", observations = emptyList()))

    mvc
      .perform(get("/api/narrative/observability/NVDA").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("NVDA"))
      .andExpect(jsonPath("$.observations").isArray)
      .andExpect(jsonPath("$.observations.length()").value(0))
  }

  @Test
  fun `controller passes the symbol path variable through verbatim`() {
    // Service is responsible for trim + uppercase, not the controller. Pinned so a future
    // « let's normalise at the edge » doesn't double-normalise (or worse, miss the cache key
    // alignment on the chart fetch).
    given(service.findFor(eq("aapl"), anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(NarrativeObservationsResponse(symbol = "AAPL", observations = emptyList()))

    mvc.perform(get("/api/narrative/observability/aapl")).andExpect(status().isOk)

    verify(service).findFor(eq("aapl"), anyOrNull(), anyOrNull(), anyOrNull())
  }

  // ---------------------------------------------------------------------- filters round-trip

  @Test
  fun `from and to filters bind ISO 8601 instants and reach the service`() {
    val fromCaptor = argumentCaptor<Instant>()
    val toCaptor = argumentCaptor<Instant>()
    given(service.findFor(any(), anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(NarrativeObservationsResponse(symbol = "NVDA", observations = emptyList()))

    mvc
      .perform(
        get("/api/narrative/observability/NVDA")
          .param("from", "2026-04-01T00:00:00Z")
          .param("to", "2026-05-01T00:00:00Z")
          .accept(MediaType.APPLICATION_JSON)
      )
      .andExpect(status().isOk)

    verify(service).findFor(eq("NVDA"), fromCaptor.capture(), toCaptor.capture(), isNull())
    assertEquals(Instant.parse("2026-04-01T00:00:00Z"), fromCaptor.firstValue)
    assertEquals(Instant.parse("2026-05-01T00:00:00Z"), toCaptor.firstValue)
  }

  @Test
  fun `promptId filter binds the UUID and reaches the service`() {
    // Pin the query-param name « promptId » (vs the internal Kotlin name `promptTemplateId`).
    // The frontend writes `?promptId=...` ; renaming here would silently empty the filtered view.
    val promptId = UUID.fromString("12345678-1234-1234-1234-123456789012")
    given(service.findFor(eq("NVDA"), isNull(), isNull(), eq(promptId)))
      .willReturn(NarrativeObservationsResponse(symbol = "NVDA", observations = emptyList()))

    mvc
      .perform(get("/api/narrative/observability/NVDA").param("promptId", promptId.toString()))
      .andExpect(status().isOk)

    verify(service).findFor(eq("NVDA"), isNull(), isNull(), eq(promptId))
  }

  // ---------------------------------------------------------------------- full row wire shape

  @Test
  fun `observation JSON shape carries all fields the frontend page consumes`() {
    val snapshotId = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    val promptTemplateId = UUID.fromString("11111111-2222-3333-4444-555555555555")
    val obs =
      NarrativeObservationDto(
        snapshotId = snapshotId,
        symbol = "NVDA",
        generatedAt = Instant.parse("2026-04-01T15:00:00Z"),
        price = BigDecimal("100.0000"),
        summary = "Price above MA200, RSI 62 — bullish posture.",
        sentiment = Sentiment.BULLISH,
        keyPoints = listOf("price above MA200", "RSI 62 mid-bullish", "positive 21-day momentum"),
        modelUsed = "claude-haiku-4-5",
        promptVersion = "v2",
        promptTemplateId = promptTemplateId,
        promptName = "narrative-default",
        promptTemplateVersion = "v2",
        thumbsValue = 1,
        priceAt1d = BigDecimal("102.0000"),
        priceAt1w = BigDecimal("105.0000"),
        priceAt1m = BigDecimal("110.0000"),
        delta1d = BigDecimal("0.0200"),
        delta1w = BigDecimal("0.0500"),
        delta1m = BigDecimal("0.1000"),
      )
    given(service.findFor(eq("NVDA"), anyOrNull(), anyOrNull(), anyOrNull()))
      .willReturn(NarrativeObservationsResponse(symbol = "NVDA", observations = listOf(obs)))

    mvc
      .perform(get("/api/narrative/observability/NVDA").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.observations.length()").value(1))
      .andExpect(jsonPath("$.observations[0].snapshotId").value(snapshotId.toString()))
      .andExpect(jsonPath("$.observations[0].sentiment").value("BULLISH"))
      .andExpect(jsonPath("$.observations[0].keyPoints.length()").value(3))
      .andExpect(jsonPath("$.observations[0].promptName").value("narrative-default"))
      .andExpect(jsonPath("$.observations[0].promptTemplateVersion").value("v2"))
      .andExpect(jsonPath("$.observations[0].promptTemplateId").value(promptTemplateId.toString()))
      .andExpect(jsonPath("$.observations[0].thumbsValue").value(1))
      // Presence-only on the numeric fields — exact BigDecimal serialisation depends on Jackson
      // config and is pinned by the service tests, where we control the input numerically.
      .andExpect(jsonPath("$.observations[0].priceAt1d").exists())
      .andExpect(jsonPath("$.observations[0].priceAt1w").exists())
      .andExpect(jsonPath("$.observations[0].priceAt1m").exists())
      .andExpect(jsonPath("$.observations[0].delta1d").exists())
      .andExpect(jsonPath("$.observations[0].delta1w").exists())
      .andExpect(jsonPath("$.observations[0].delta1m").exists())
  }

  // ---------------------------------------------------------------------- /tickers index (PR3)

  @Test
  fun `GET tickers returns the index list with symbol count and lastGeneratedAt`() {
    // Pin (a) the route literal `/tickers` resolves to `listTickers()` and NOT to the
    // `{symbol}` path with `symbol = "tickers"` — Spring matches the literal segment first
    // because the controller declares `/tickers` *before* `/{symbol}`. A regression that
    // re-ordered the methods would silently return an empty timeline for « tickers ».
    // (b) the JSON shape is what the page consumes verbatim.
    given(service.listTickers())
      .willReturn(
        listOf(
          TickerObservationIndexDto(
            symbol = "NVDA",
            snapshotCount = 12,
            lastGeneratedAt = Instant.parse("2026-05-13T10:00:00Z"),
          ),
          TickerObservationIndexDto(
            symbol = "AAPL",
            snapshotCount = 3,
            lastGeneratedAt = Instant.parse("2026-05-12T16:00:00Z"),
          ),
        )
      )

    mvc
      .perform(get("/api/narrative/observability/tickers").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(2))
      .andExpect(jsonPath("$[0].symbol").value("NVDA"))
      .andExpect(jsonPath("$[0].snapshotCount").value(12))
      .andExpect(jsonPath("$[0].lastGeneratedAt").exists())
      .andExpect(jsonPath("$[1].symbol").value("AAPL"))
      .andExpect(jsonPath("$[1].snapshotCount").value(3))
  }

  @Test
  fun `GET tickers returns an empty array when no narrative exists yet`() {
    // Pin the empty-shape `[]` rather than 404 — the page reads `.length === 0` to render the
    // empty hint, and a 404 would force an unnecessary error-banner branch.
    given(service.listTickers()).willReturn(emptyList())

    mvc
      .perform(get("/api/narrative/observability/tickers").accept(MediaType.APPLICATION_JSON))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$").isArray)
      .andExpect(jsonPath("$.length()").value(0))
  }
}
