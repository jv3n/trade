package com.portfolioai.e2e

import com.portfolioai.auth.application.AuthService
import com.portfolioai.scanner.application.dto.ScannedStatsRequest
import com.portfolioai.stats.application.ScannedStatService
import com.portfolioai.stats.application.dto.ScannedStatsResult
import org.springframework.context.annotation.Profile
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Drops scanner stats for the e2e user (#764) — the scanner's own path, minus its token and its
 * configured owner : each e2e test has a user of its own, the scanner pushes for one only.
 */
@Profile("e2e")
@RestController
@RequestMapping("/api/e2e")
class E2eScannerController(
  private val scannedStats: ScannedStatService,
  private val authService: AuthService,
) {

  @PostMapping("/scanner-stats")
  fun drop(@RequestBody request: ScannedStatsRequest): ScannedStatsResult =
    scannedStats.record(authService.getCurrentUser(), request.tradingDate, request.stats)
}
