package com.portfolioai.stats.application

import com.portfolioai.auth.domain.User
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.shared.Pattern
import com.portfolioai.shared.badRequest
import com.portfolioai.stats.application.dto.ScanSkipReason
import com.portfolioai.stats.application.dto.ScannedStat
import com.portfolioai.stats.application.dto.ScannedStatCreated
import com.portfolioai.stats.application.dto.ScannedStatSkipped
import com.portfolioai.stats.application.dto.ScannedStatsResult
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatReview
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.time.Clock
import java.time.LocalDate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Records the stats ts-scanner found on a trading day (#763), each one **to review**, for the
 * scanner's owner.
 *
 * **Never a stat that exists** : a (day, ticker, pattern) already in the sheet — typed, promoted
 * from a candidate, to review, validated or rejected — is skipped and reported, so pushing a batch
 * twice creates nothing and a rejection is never undone. A stat its own rules refuse is skipped too
 * : one bad reading does not lose the rest of the batch.
 */
@Service
class ScannedStatService(
  private val repo: StatEntryRepository,
  private val tradeEntryService: TradeEntryService,
  private val clock: Clock,
) {

  /** Whether [owner] holds a stat of [ticker] on [tradingDate], whatever its pattern or review. */
  @Transactional(readOnly = true)
  fun hasStat(owner: User, tradingDate: LocalDate, ticker: String): Boolean =
    repo
      .findByUserIdAndTradeDateAndTicker(owner.id, tradingDate, ticker.trim().uppercase())
      .isNotEmpty()

  @Transactional
  fun record(owner: User, tradingDate: LocalDate, stats: List<ScannedStat>): ScannedStatsResult {
    if (tradingDate.isAfter(LocalDate.now(clock))) {
      throw badRequest("A scan can't be dated in the future ($tradingDate)")
    }
    val created = mutableListOf<ScannedStatCreated>()
    val skipped = mutableListOf<ScannedStatSkipped>()
    val seen = mutableSetOf<Pair<String, Pattern>>()
    for (scanned in stats) {
      val request = scanned.toRequest(tradingDate)
      val ticker = request.ticker.trim().uppercase()
      fun skip(reason: ScanSkipReason, detail: String? = null) {
        skipped += ScannedStatSkipped(ticker, scanned.pattern, reason, detail)
      }
      if (ticker.isEmpty()) {
        skip(ScanSkipReason.INVALID, "Ticker must not be blank")
        continue
      }
      if (!seen.add(ticker to scanned.pattern)) {
        skip(ScanSkipReason.DUPLICATE_IN_BATCH)
        continue
      }
      val existing =
        repo.findByUserIdAndTradeDateAndTickerAndPattern(
          owner.id,
          tradingDate,
          ticker,
          scanned.pattern,
        )
      if (existing != null) {
        skip(existing.skipReason)
        continue
      }
      val entry =
        StatEntry(
          user = owner,
          tradeDate = tradingDate,
          ticker = ticker,
          source = StatSource.SCANNER,
          review = StatReview.TO_REVIEW,
        )
      try {
        entry.fillFrom(request, ticker)
      } catch (refused: ResponseStatusException) {
        skip(ScanSkipReason.INVALID, refused.reason)
        continue
      }
      val saved = repo.saveAndFlush(entry)
      tradeEntryService.attachToStat(
        saved.id,
        owner.id,
        saved.tradeDate,
        saved.ticker,
        saved.pattern,
      )
      created += ScannedStatCreated(saved.id, saved.ticker, saved.pattern)
    }
    return ScannedStatsResult(created, skipped)
  }

  private val StatEntry.skipReason: ScanSkipReason
    get() =
      when (review) {
        null -> ScanSkipReason.TYPED_BY_HAND
        StatReview.REJECTED -> ScanSkipReason.REJECTED
        else -> ScanSkipReason.ALREADY_SCANNED
      }
}
