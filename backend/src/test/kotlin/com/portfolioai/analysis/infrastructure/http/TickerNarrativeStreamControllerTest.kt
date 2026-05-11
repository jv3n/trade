package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.JobEventPublisher
import com.portfolioai.analysis.application.TickerNarrativeJobStore
import com.portfolioai.analysis.application.TickerNarrativePromptService
import com.portfolioai.analysis.application.TickerNarrativeService
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.market.application.TickerService
import com.portfolioai.shared.GlobalExceptionHandler
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice on the SSE endpoint `GET /jobs/{jobId}/stream` of [TickerNarrativeController]
 * — pins the audit 2026-05-10 finding #4 fix : the controller must 404 when the [jobId] in the path
 * does not belong to a job whose `symbol` matches the path's [symbol].
 *
 * Why we care, even in single-user no-auth :
 * - Today : nothing breaks. UUIDv4 makes random sniffing impractical and there's no other tenant.
 * - Phase 5 multi-user (OAuth2 in the backlog) : without this check, user A can stream user B's
 *   events on user A's `/{symbol}` URL just by guessing — or accidentally re-using — user B's
 *   `jobId`. Discipline that's annoying to retrofit, easy to put in now.
 * - Bonus : conflating "missing job" and "wrong symbol" into a single 404 removes the existence
 *   oracle on jobId — clients can't probe whether a UUID is a real job by watching the response
 *   shape.
 *
 * What we pin :
 * - **Stream returns 404 when [jobId] is unknown to the store** — the publisher must NOT be hit.
 * - **Stream returns 404 when [jobId] points to a job for a different [symbol]** — even if the job
 *   exists. Same uniform 404 shape as the unknown case.
 * - **Symbol matching is case-insensitive on the path side** — a lowercase URL `aapl/.../jobs/...`
 *   resolves to the uppercase `AAPL` job. Mirrors the normalisation already in place on
 *   `pendingFor` and `startAsync`.
 *
 * Not pinned here : the happy path (`200` + SSE stream). MockMvc against [SseEmitter] is awkward —
 * the wire format is exercised end-to-end by the frontend's `job-stream.service.spec.ts` and the
 * backend's `JobEventPublisherTest`.
 */
@WebMvcTest(TickerNarrativeController::class, GlobalExceptionHandler::class)
class TickerNarrativeStreamControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var jobStore: TickerNarrativeJobStore
  @MockitoBean private lateinit var jobEventPublisher: JobEventPublisher

  @Suppress("unused") @MockitoBean private lateinit var service: TickerNarrativeService
  @Suppress("unused") @MockitoBean private lateinit var tickerService: TickerService
  @Suppress("unused") @MockitoBean private lateinit var promptService: TickerNarrativePromptService

  @Test
  fun `stream returns 404 when the jobId is unknown to the store`() {
    val jobId = UUID.fromString("11111111-2222-3333-4444-555555555555")
    given(jobStore.get(jobId)).willReturn(null)

    // No `Accept: text/event-stream` on the rejection paths — MockMvc's default `*/*` lets the
    // `GlobalExceptionHandler` write its JSON error body (the handler doesn't know how to produce
    // `text/event-stream`, so a strict SSE Accept would 406 the response and mask the 404 we
    // want to assert). In production the browser's `EventSource` does send `text/event-stream`
    // and the body shape is irrelevant on a non-2xx — only the status drives the `error` event.
    mvc
      .perform(get("/api/market/ticker/AAPL/narrative/jobs/$jobId/stream"))
      .andExpect(status().isNotFound)

    // The publisher must NOT be hit on the rejection path — otherwise we'd leak an emitter
    // registration for a jobId the client has no business streaming.
    verify(jobEventPublisher, never()).register(jobId)
  }

  @Test
  fun `stream returns 404 when the jobId belongs to a different symbol`() {
    val jobId = UUID.fromString("22222222-3333-4444-5555-666666666666")
    // The job exists, but it's NVDA's. The path says AAPL — same uniform 404 as the unknown case
    // so a malicious / curious caller can't distinguish "wrong symbol" from "no such job".
    given(jobStore.get(jobId))
      .willReturn(
        TickerNarrativeJob(
          id = jobId,
          symbol = "NVDA",
          createdAt = Instant.parse("2026-05-10T12:00:00Z"),
        )
      )

    mvc
      .perform(get("/api/market/ticker/AAPL/narrative/jobs/$jobId/stream"))
      .andExpect(status().isNotFound)

    verify(jobEventPublisher, never()).register(jobId)
  }

  @Test
  fun `stream tolerates a lowercase symbol on the path against an uppercase job symbol`() {
    // The dossier endpoint and the watchlist already uppercase on the way in. The SSE check uses
    // the same `symbol.uppercase()` normalisation so a stray lowercase URL doesn't 404 a legitimate
    // stream — keep the discipline consistent across the controller.
    val jobId = UUID.fromString("33333333-4444-5555-6666-777777777777")
    given(jobStore.get(jobId))
      .willReturn(
        TickerNarrativeJob(
          id = jobId,
          symbol = "AAPL",
          createdAt = Instant.parse("2026-05-10T12:00:00Z"),
        )
      )
    given(jobEventPublisher.register(jobId))
      .willReturn(org.springframework.web.servlet.mvc.method.annotation.SseEmitter(0L))

    // We don't assert on the body — MockMvc + SseEmitter is awkward and the end-to-end behaviour
    // is covered elsewhere. The point of this test is that the symbol case mismatch alone does NOT
    // 404, i.e. the validation is on the uppercased value, not the raw path segment.
    mvc
      .perform(
        get("/api/market/ticker/aapl/narrative/jobs/$jobId/stream")
          .accept(MediaType.TEXT_EVENT_STREAM)
      )
      .andExpect(status().isOk)

    verify(jobEventPublisher).register(jobId)
  }
}
