package com.portfolioai.analysis.infrastructure.http

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
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

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
) {
  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  fun start(@PathVariable symbol: String): TickerNarrativeJobDto =
    service.startAsync(symbol).toDto()

  @GetMapping("/jobs/{jobId}")
  fun getJob(@PathVariable symbol: String, @PathVariable jobId: UUID): TickerNarrativeJobDto =
    jobStore.get(jobId)?.toDto() ?: throw NoSuchElementException("Job $jobId not found")

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
