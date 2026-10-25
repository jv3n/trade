package com.portfolioai.scanner.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.scanner.application.dto.ScannedStatsRequest
import com.portfolioai.scanner.application.dto.ScannerRunDto
import com.portfolioai.scanner.application.dto.ScannerRunRequest
import com.portfolioai.scanner.application.dto.toDto
import com.portfolioai.scanner.domain.ScannerRun
import com.portfolioai.scanner.infrastructure.persistence.ScannerRunRepository
import com.portfolioai.shared.badRequest
import com.portfolioai.stats.application.ScannedStatService
import com.portfolioai.stats.application.dto.ScannedStatsResult
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * What ts-scanner pushes (#763) — the stats it found and the report of each run — recorded for the
 * one user it scans for, `scanner.owner-user-id`. Unset or unknown, every push is a 503 : the
 * scanner is told `trade` is not set up for it, rather than its stats landing nowhere.
 */
@Service
class ScannerService(
  private val users: UserRepository,
  private val scannedStats: ScannedStatService,
  private val runs: ScannerRunRepository,
  private val authService: AuthService,
  @Value("\${scanner.owner-user-id:}") private val ownerUserId: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun recordStats(request: ScannedStatsRequest): ScannedStatsResult {
    val owner = owner()
    val result = scannedStats.record(owner, request.tradingDate, request.stats)
    log.info(
      "Scanner pushed {} stats for {} : {} created, {} skipped, userId={}",
      request.stats.size,
      request.tradingDate,
      result.created.size,
      result.skipped.size,
      owner.id,
    )
    return result
  }

  @Transactional
  fun recordRun(request: ScannerRunRequest): ScannerRunDto {
    if (listOf(request.tickersScanned, request.gusFound, request.dtFound).any { it < 0 }) {
      throw badRequest("A run's counts must not be negative")
    }
    if (request.finishedAt != null && request.finishedAt < request.startedAt) {
      throw badRequest("A run can't finish before it starts")
    }
    val owner = owner()
    val run =
      runs.save(
        ScannerRun(
          user = owner,
          tradingDate = request.tradingDate,
          startedAt = request.startedAt,
          finishedAt = request.finishedAt,
          tickersScanned = request.tickersScanned,
          gusFound = request.gusFound,
          dtFound = request.dtFound,
          error = request.error?.trim()?.take(ERROR_MAX)?.ifEmpty { null },
        )
      )
    log.info(
      "Scanner run for {} reported, failed={}, userId={}",
      run.tradingDate,
      run.error != null,
      owner.id,
    )
    return run.toDto()
  }

  /** The caller's latest run, for the Today page (#765) — null before the scanner ever ran. */
  @Transactional(readOnly = true)
  fun latestRun(): ScannerRunDto? =
    runs.findFirstByUserIdOrderByStartedAtDesc(authService.getCurrentUser().id)?.toDto()

  private fun owner(): User {
    val id =
      runCatching { UUID.fromString(ownerUserId.trim()) }.getOrNull()
        ?: throw notConfigured("scanner.owner-user-id is not set")
    return users.findById(id).orElseThrow { notConfigured("the scanner's owner does not exist") }
  }

  private fun notConfigured(why: String) =
    ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scanner not configured : $why")

  private companion object {
    const val ERROR_MAX = 2000
  }
}
