package com.portfolioai.scanner.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.daybars.application.DayBarsService
import com.portfolioai.daybars.application.dto.DayTicker
import com.portfolioai.daybars.application.dto.toDomain
import com.portfolioai.scanner.application.dto.DayBarsRequest
import com.portfolioai.scanner.application.dto.ScannedStatsRequest
import com.portfolioai.scanner.application.dto.ScannerRunDto
import com.portfolioai.scanner.application.dto.ScannerRunRequest
import com.portfolioai.scanner.application.dto.toDto
import com.portfolioai.scanner.domain.ScannerRun
import com.portfolioai.scanner.infrastructure.persistence.ScannerRunRepository
import com.portfolioai.shared.badRequest
import com.portfolioai.stats.application.ScannedStatService
import com.portfolioai.stats.application.dto.ScannedStatsResult
import java.time.LocalDate
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
  private val dayBars: DayBarsService,
  @Value("\${scanner.owner-user-id:}") private val ownerUserId: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  /**
   * The batch's stats and their bars, all or nothing : a bar refused, or a store failing midway,
   * keeps none of it.
   */
  @Transactional
  fun recordStats(request: ScannedStatsRequest): ScannedStatsResult {
    val owner = owner()
    val tickers = request.stats.map { it.ticker.trim().uppercase() }.toSet()
    val strays = request.bars.map { it.ticker.trim().uppercase() }.filterNot { it in tickers }
    if (strays.isNotEmpty()) throw badRequest("Bars without a stat in the batch : $strays")
    val bars = request.bars.associate { it.ticker to it.bars.map { bar -> bar.toDomain() } }
    bars.forEach { (ticker, day) -> dayBars.check(request.tradingDate, ticker, day) }
    val result = scannedStats.record(owner, request.tradingDate, request.stats)
    bars.forEach { (ticker, day) -> dayBars.store(request.tradingDate, ticker, day) }
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

  /**
   * The owner's ticker-days still without bars (#798), newest first, at most [limit] — clamped to
   * 1–[MISSING_MAX], one provider request each.
   */
  fun missingBars(limit: Int): List<DayTicker> =
    dayBars.missing(owner().id, limit.coerceIn(1, MISSING_MAX))

  /** The bars of a ticker-day the scanner fetched — of a stat of the owner, or a 400. */
  fun recordBars(request: DayBarsRequest) {
    requireStat(request.tradingDate, request.ticker)
    dayBars.store(request.tradingDate, request.ticker, request.bars.map { it.toDomain() })
  }

  /** The provider served nothing for the ticker-day : the scanner won't be asked for it again. */
  fun recordBarsNotFound(request: DayTicker) {
    requireStat(request.tradingDate, request.ticker)
    dayBars.markNotFound(request.tradingDate, request.ticker)
  }

  private fun requireStat(tradingDate: LocalDate, ticker: String) {
    if (!scannedStats.hasStat(owner(), tradingDate, ticker))
      throw badRequest("No stat of $ticker on $tradingDate")
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
          missedTickers = missedOf(request.missedTickers),
        )
      )
    log.info(
      "Scanner run for {} reported, failed={}, missed={}, userId={}",
      run.tradingDate,
      run.error != null,
      request.missedTickers.size,
      owner.id,
    )
    return run.toDto()
  }

  /** The caller's latest run, for the Today page (#765) — null before the scanner ever ran. */
  @Transactional(readOnly = true)
  fun latestRun(): ScannerRunDto? =
    runs.findFirstByUserIdOrderByStartedAtDesc(authService.getCurrentUser().id)?.toDto()

  /**
   * The tickers alone, each once : an entry is read down to its first word, kept when it is a
   * ticker — a reason riding with it (« SGRX (timeout, …) ») would split on its own comma into a
   * second, bogus ticker. Past the column's room, the list is cut on a whole ticker.
   */
  private fun missedOf(tickers: List<String>): String? {
    val clean =
      tickers
        .map { it.trim().uppercase().split(' ', '(').first() }
        .filter { TICKER.matches(it) }
        .distinct()
    val kept = mutableListOf<String>()
    for (ticker in clean) {
      if ((kept + ticker).joinToString(",").length > ERROR_MAX) break
      kept += ticker
    }
    return kept.joinToString(",").ifEmpty { null }
  }

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
    const val MISSING_MAX = 100
    val TICKER = Regex("^[A-Z]{1,5}$")
  }
}
