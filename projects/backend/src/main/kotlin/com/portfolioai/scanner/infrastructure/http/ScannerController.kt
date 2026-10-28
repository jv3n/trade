package com.portfolioai.scanner.infrastructure.http

import com.portfolioai.daybars.application.dto.DayTicker
import com.portfolioai.scanner.application.ScannerService
import com.portfolioai.scanner.application.dto.DayBarsRequest
import com.portfolioai.scanner.application.dto.ScannedStatsRequest
import com.portfolioai.scanner.application.dto.ScannerRunDto
import com.portfolioai.scanner.application.dto.ScannerRunRequest
import com.portfolioai.stats.application.dto.ScannedStatsResult
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Scanner",
  description =
    "ts-scanner's way in : the POSTs and the missing-bars list take its bearer token and nothing " +
      "else, the latest run is read by the owner's session.",
)
@RestController
@RequestMapping("/api/scanner")
class ScannerController(private val service: ScannerService) {

  /** The stats found on one trading day, created to review ; the existing ones are skipped. */
  @PostMapping("/stats")
  fun recordStats(@RequestBody request: ScannedStatsRequest): ScannedStatsResult =
    service.recordStats(request)

  @PostMapping("/runs")
  @ResponseStatus(HttpStatus.CREATED)
  fun recordRun(@RequestBody request: ScannerRunRequest): ScannerRunDto = service.recordRun(request)

  /** The owner's ticker-days still without bars (#798), newest first — the scanner fetches them. */
  @GetMapping("/bars/missing")
  fun missingBars(@RequestParam(defaultValue = "20") limit: Int): List<DayTicker> =
    service.missingBars(limit)

  @PostMapping("/bars")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun recordBars(@RequestBody request: DayBarsRequest) = service.recordBars(request)

  @PostMapping("/bars/not-found")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun recordBarsNotFound(@RequestBody request: DayTicker) = service.recordBarsNotFound(request)

  /** 204 before the scanner ever ran. */
  @GetMapping("/runs/latest")
  fun latestRun(): ResponseEntity<ScannerRunDto> =
    service.latestRun()?.let { ResponseEntity.ok(it) } ?: ResponseEntity.noContent().build()
}
