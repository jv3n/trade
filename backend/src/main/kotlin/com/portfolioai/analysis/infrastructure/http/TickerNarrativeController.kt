package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.JobEventPublisher
import com.portfolioai.analysis.application.NARRATIVE_PROMPT_VERSION
import com.portfolioai.analysis.application.NARRATIVE_SYSTEM_PROMPT
import com.portfolioai.analysis.application.TickerNarrativeJobStore
import com.portfolioai.analysis.application.TickerNarrativeService
import com.portfolioai.analysis.application.buildNarrativeUserMessage
import com.portfolioai.analysis.application.dto.NarrativePromptPreviewDto
import com.portfolioai.analysis.application.dto.TickerNarrativeJobDto
import com.portfolioai.analysis.application.dto.TickerNarrativeSnapshotDto
import com.portfolioai.analysis.application.dto.toDto
import com.portfolioai.market.application.TickerService
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * HTTP surface for the Phase 1 narrative pipeline. Co-located URL-wise with the dossier
 * (`/api/market/ticker/{symbol}/...`) but lives in the analysis module so the LLM pipeline stays
 * cohesive — see `docs/technique/architecture.md`.
 *
 * Frontend flow :
 * - On dossier load → `GET /narrative/latest` to display whatever's already cached.
 * - User clicks "Régénérer" → `POST /narrative` → poll `GET /narrative/jobs/{id}` until DONE →
 *   re-fetch latest. The service dedups concurrent kicks and reuses snapshots < 30 min old.
 */
@Tag(
  name = "Ticker Narrative",
  description =
    "Phase 1 LLM-generated narrative per ticker (kick a job, poll its status, read the latest snapshot)",
)
@RestController
@RequestMapping("/api/market/ticker/{symbol}/narrative")
class TickerNarrativeController(
  private val service: TickerNarrativeService,
  private val jobStore: TickerNarrativeJobStore,
  private val tickerService: TickerService,
  private val jobEventPublisher: JobEventPublisher,
) {
  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  fun start(@PathVariable symbol: String): TickerNarrativeJobDto =
    service.startAsync(symbol).toDto()

  @GetMapping("/jobs/{jobId}")
  fun getJob(@PathVariable symbol: String, @PathVariable jobId: UUID): TickerNarrativeJobDto =
    jobStore.get(jobId)?.toDto() ?: throw NoSuchElementException("Job $jobId not found")

  /**
   * Most recent `PENDING` job for [symbol] within the dedup window, or 404 if none. Used by the
   * dossier on init : if a job is currently running (typical when the user navigated away during a
   * slow Ollama call and just came back), the frontend reattaches to its SSE stream instead of
   * showing an empty state and forcing a re-kick. Spring routes `/jobs/pending` here in preference
   * over `/jobs/{jobId}` because the literal path segment is more specific than the `UUID`
   * variable.
   */
  @GetMapping("/jobs/pending")
  fun getPendingJob(@PathVariable symbol: String): TickerNarrativeJobDto =
    service.pendingFor(symbol)?.toDto()
      ?: throw NoSuchElementException("No pending narrative job for $symbol")

  /**
   * Server-Sent Events stream of [com.portfolioai.analysis.domain.JobEvent]s for a running (or
   * recently terminal) job. Replaces the 3-second poll on `GET /jobs/{id}` for the narrative
   * generation flow : the frontend opens an `EventSource` after kicking the job and receives a
   * `phase` event per pipeline transition (`LOADING_CONTEXT` → `CALLING_LLM` → … → `DONE` /
   * `ERROR`). Replay-on-reconnect is handled by [JobEventPublisher] — late connectors get the full
   * history before live tail starts.
   *
   * **Path consistency check (audit 2026-05-10 finding #4)** — the [jobId] path variable must
   * belong to a job whose `symbol` matches the [symbol] path variable, otherwise we 404. Without
   * the check, `/api/market/ticker/AAPL/narrative/jobs/{jobIdDeNVDA}/stream` would silently stream
   * NVDA's events on the AAPL URL — harmless in single-user no-auth, but a cross-tenant leak the
   * day Phase 5 OAuth2 lands. Treating "missing job" and "wrong symbol" as the same 404 also
   * removes the existence oracle on jobIds. Mirror of the same discipline already in place on
   * `/jobs/pending` (filtered by symbol via [TickerNarrativeService.pendingFor]).
   */
  @GetMapping("/jobs/{jobId}/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
  fun streamJob(@PathVariable symbol: String, @PathVariable jobId: UUID): SseEmitter {
    val job = jobStore.get(jobId)
    if (job == null || job.symbol != symbol.uppercase()) {
      throw NoSuchElementException("Job $jobId not found for $symbol")
    }
    return jobEventPublisher.register(jobId)
  }

  @GetMapping("/latest")
  fun getLatest(@PathVariable symbol: String): TickerNarrativeSnapshotDto =
    service.latestSnapshot(symbol)?.toDto()
      ?: throw NoSuchElementException("No narrative snapshot for $symbol")

  /**
   * Read-only preview of the system + user prompt for [symbol] — no LLM call. Backs the
   * `/settings/prompt-preview` page so the user can inspect exactly what the runner would send to
   * Claude/Ollama on a given ticker.
   */
  @GetMapping("/preview")
  fun preview(@PathVariable symbol: String): NarrativePromptPreviewDto {
    val snapshot = tickerService.load(symbol)
    val indicators =
      snapshot.indicators
        ?: throw IllegalStateException(
          "No indicators computed for $symbol — series too short to preview"
        )
    val userMessage = buildNarrativeUserMessage(snapshot.quote, indicators)
    return NarrativePromptPreviewDto(
      symbol = snapshot.quote.symbol,
      systemPrompt = NARRATIVE_SYSTEM_PROMPT,
      userMessage = userMessage,
      systemPromptChars = NARRATIVE_SYSTEM_PROMPT.length,
      userMessageChars = userMessage.length,
      promptVersion = NARRATIVE_PROMPT_VERSION,
    )
  }
}
