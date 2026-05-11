package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.JobEventPublisher
import com.portfolioai.analysis.application.TickerNarrativeJobStore
import com.portfolioai.analysis.application.TickerNarrativePromptService
import com.portfolioai.analysis.application.TickerNarrativeService
import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.market.application.TickerService
import com.portfolioai.shared.GlobalExceptionHandler
import java.time.Instant
import java.util.UUID
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
 * `@WebMvcTest` slice for the `GET /jobs/pending` endpoint of [TickerNarrativeController]. The
 * dossier ticker page hits this on init : if a narrative job is currently running for the symbol,
 * the frontend reattaches to its SSE stream instead of showing an empty state and forcing the user
 * to re-kick. The case is observable when a user starts a generation, navigates away mid-flight
 * (Ollama narrative on Mac CPU = 60-180 s easy), and comes back — without this endpoint, the
 * running `@Async` job would finish silently and the dossier would only catch up on the next manual
 * click.
 *
 * What we pin :
 * - **Endpoint URL** — `GET /api/market/ticker/{symbol}/narrative/jobs/pending`. Spring routes the
 *   literal `pending` segment in preference to the sibling `/jobs/{jobId}` UUID variable ; this
 *   test catches a refactor that breaks that ordering (e.g. someone shadows it with a regex
 *   constraint).
 * - **JSON shape** — same `TickerNarrativeJobDto` as the existing
 *   [TickerNarrativeController.getJob] endpoint, so the frontend can reuse its `TickerNarrativeJob`
 *   type for both "kicked job freshly returned by POST" and "pending job rediscovered on reattach".
 * - **404 contract on no-pending** — fresh dossier visit (or job already terminal) yields 404,
 *   which the frontend's adapter maps to `null` so the page just stays in its initial state. Same
 *   shape as [TickerNarrativeController.getLatest] for consistency.
 * - **Service-level normalisation** — the controller uppercases the symbol via
 *   [TickerNarrativeService.pendingFor] (mirror of [TickerNarrativeService.startAsync]) so a
 *   lowercase URL still hits the right dedup key. We don't re-prove this here (it's pinned in
 *   `TickerNarrativeServiceTest`) but we pin that the controller delegates to the service rather
 *   than to the [TickerNarrativeJobStore] directly — that's where the normalisation lives.
 */
@WebMvcTest(TickerNarrativeController::class, GlobalExceptionHandler::class)
class TickerNarrativePendingJobControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: TickerNarrativeService

  // Other deps must be provided for the slice to instantiate even though the pending endpoint
  // doesn't read them.
  @Suppress("unused") @MockitoBean private lateinit var jobStore: TickerNarrativeJobStore
  @Suppress("unused") @MockitoBean private lateinit var jobEventPublisher: JobEventPublisher
  @Suppress("unused") @MockitoBean private lateinit var tickerService: TickerService
  @Suppress("unused") @MockitoBean private lateinit var promptService: TickerNarrativePromptService

  @Test
  fun `GET pending job returns 200 with the dto when a pending job exists for the symbol`() {
    val jobId = UUID.fromString("11111111-2222-3333-4444-555555555555")
    val createdAt = Instant.parse("2026-05-09T12:34:56Z")
    given(service.pendingFor("AAPL"))
      .willReturn(TickerNarrativeJob(id = jobId, symbol = "AAPL", createdAt = createdAt))

    mvc
      .perform(
        get("/api/market/ticker/AAPL/narrative/jobs/pending").accept(MediaType.APPLICATION_JSON)
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.jobId").value(jobId.toString()))
      .andExpect(jsonPath("$.symbol").value("AAPL"))
      .andExpect(jsonPath("$.status").value(JobStatus.PENDING.name))
      .andExpect(jsonPath("$.createdAt").value("2026-05-09T12:34:56Z"))
  }

  @Test
  fun `GET pending job returns 404 when no pending job exists for the symbol`() {
    given(service.pendingFor("AAPL")).willReturn(null)

    mvc
      .perform(
        get("/api/market/ticker/AAPL/narrative/jobs/pending").accept(MediaType.APPLICATION_JSON)
      )
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }
}
