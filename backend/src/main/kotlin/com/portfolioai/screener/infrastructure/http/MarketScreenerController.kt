package com.portfolioai.screener.infrastructure.http

import com.portfolioai.screener.application.MarketScreenerService
import com.portfolioai.screener.application.dto.ScreenerSnapshotResponse
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Market radar endpoints (Phase 6). Two paths since ticket (9) introduced snapshot persistance :
 * - `POST /api/screener/refresh` — explicit user trigger (« Rechercher » button). Calls the active
 *   provider, persists the snapshot, returns it. The only path that burns a provider quota.
 * - `GET /api/screener/movers` — read path. Returns the latest persisted snapshot for the active
 *   provider, or a specific day when `?date=YYYY-MM-DD` is passed. Empty envelope (200 + `null`
 *   date / fetchedAt + empty movers) when nothing has been persisted yet — the UI then shows the «
 *   clique sur Rechercher pour amorcer » hint.
 *
 * The dynamic filter (gap %, volume ratio, market cap, exchange, sector) used to be query params on
 * the GET ; it now runs client-side on the persisted snapshot so panel tweaks don't burn quota.
 *
 * Errors flow through the global exception handler — 503 means the upstream provider failed (only
 * reachable on the POST path), 400 means the active provider name is unknown (mis-config).
 */
@Tag(name = "Screener", description = "Market radar — tickers showing abnormal moves at the open")
@RestController
@RequestMapping("/api/screener")
class MarketScreenerController(private val service: MarketScreenerService) {

  @PostMapping("/refresh") fun refresh(): ScreenerSnapshotResponse = service.refresh()

  @GetMapping("/movers")
  fun movers(
    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate?
  ): ScreenerSnapshotResponse = service.loadSnapshot(date)
}
