package com.portfolioai.analysis.infrastructure.http

import com.portfolioai.analysis.application.TickerNarrativeJobStore
import com.portfolioai.analysis.application.TickerNarrativeService
import com.portfolioai.analysis.application.dto.TickerNarrativeJobDto
import com.portfolioai.analysis.application.dto.TickerNarrativeSnapshotDto
import com.portfolioai.analysis.application.dto.toDto
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*

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
@RestController
@RequestMapping("/api/market/ticker/{symbol}/narrative")
class TickerNarrativeController(
  private val service: TickerNarrativeService,
  private val jobStore: TickerNarrativeJobStore,
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
}
