package com.portfolioai.analyst.infrastructure.http

import com.portfolioai.analyst.application.AnalystRecommendationService
import com.portfolioai.analyst.application.dto.AnalystSnapshotDto
import com.portfolioai.analyst.application.dto.toDto
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Per-ticker analyst recommendations endpoint. Sits under the same
 * `/api/market/ticker/{symbol}/...` prefix as the existing dossier reads (chart, news,
 * sector-benchmark) so the front composes calls naturally.
 *
 * Errors flow through the global exception handler :
 * - 404 (`NoSuchElementException`) when the symbol has no coverage — front renders an empty state.
 * - 503 (`UpstreamUnavailableException`) on Finnhub auth/rate-limit/network — front renders an
 *   inline error banner scoped to the panel without breaking the rest of the dossier.
 */
@Tag(
  name = "Analyst",
  description = "Per-ticker analyst recommendations (consensus, breakdown, price target)",
)
@RestController
@RequestMapping("/api/market/ticker")
class AnalystController(private val service: AnalystRecommendationService) {

  @GetMapping("/{symbol}/analyst-recommendations")
  fun get(@PathVariable symbol: String): AnalystSnapshotDto = service.forSymbol(symbol).toDto()
}
