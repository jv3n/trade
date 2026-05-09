package com.portfolioai.earnings.infrastructure.http

import com.portfolioai.earnings.application.EarningsService
import com.portfolioai.earnings.application.dto.EarningsSnapshotDto
import com.portfolioai.earnings.application.dto.toDto
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Per-ticker earnings endpoint. Sits under the same `/api/market/ticker/{symbol}/...` prefix as the
 * existing dossier reads (chart, news, sector-benchmark, analyst-recommendations) so the front
 * composes calls naturally.
 *
 * Errors flow through the global exception handler :
 * - 404 (`NoSuchElementException`) when the symbol has no earnings data — front renders an empty
 *   state.
 * - 503 (`MarketUnavailableException`) on Finnhub auth/rate-limit/network — front renders an inline
 *   error banner scoped to the panel without breaking the rest of the dossier.
 */
@Tag(
  name = "Earnings",
  description = "Per-ticker earnings (last 4 quarters EPS estimate vs actual + next reporting date)",
)
@RestController
@RequestMapping("/api/market/ticker")
class EarningsController(private val service: EarningsService) {

  @GetMapping("/{symbol}/earnings")
  fun get(@PathVariable symbol: String): EarningsSnapshotDto = service.forSymbol(symbol).toDto()
}
