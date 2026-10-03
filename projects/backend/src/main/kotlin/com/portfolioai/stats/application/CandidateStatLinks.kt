package com.portfolioai.stats.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * What the `candidates` context reads and writes of the stats a candidate became — its only door
 * into `stats`. User-scoped like every read here.
 */
@Service
class CandidateStatLinks(
  private val repo: StatEntryRepository,
  private val authService: AuthService,
  private val statEntryService: StatEntryService,
) {

  /** Promotes a candidate (#189) — [StatEntryService.create], with the trace of its source. */
  fun promote(request: StatEntryRequest, candidateId: UUID): StatEntryDto =
    statEntryService.create(request, candidateId)

  /**
   * The stats each of these candidates became, by pattern (#434) — the "in stats" badges of the
   * candidates listing (#383) and the guard against promoting twice in one pattern (#189). A
   * candidate never promoted is absent.
   */
  @Transactional(readOnly = true)
  fun statIdsByCandidate(candidateIds: Collection<UUID>): Map<UUID, Map<Pattern, UUID>> {
    if (candidateIds.isEmpty()) return emptyMap()
    val userId = authService.getCurrentUser().id
    return repo
      .findByUserIdAndCandidateIdIn(userId, candidateIds)
      .mapNotNull { stat -> stat.candidateId?.let { it to (stat.pattern to stat.id) } }
      .groupBy({ it.first }, { it.second })
      .mapValues { (_, statIds) -> statIds.toMap() }
  }

  /**
   * Whether the caller's sheet already holds a stat for that (day, ticker, pattern). Lets
   * `candidates` skip a taken slot **before** calling [promote] : catching the 409 instead would
   * mark the surrounding transaction rollback-only, and the bulk promotion would fail as a whole.
   */
  @Transactional(readOnly = true)
  fun existsForDayAndTicker(tradeDate: LocalDate, ticker: String, pattern: Pattern): Boolean {
    val userId = authService.getCurrentUser().id
    return repo.findByUserIdAndTradeDateAndTickerAndPattern(
      userId,
      tradeDate,
      ticker.trim().uppercase(),
      pattern,
    ) != null
  }

  /**
   * Gives the stats born from [candidateId] the [openPrice] typed on the candidate at 9:30 — for a
   * candidate promoted before the open. A double top takes it as its start. A stat that already has
   * one keeps it : the one typed on the stat wins. No stat for that candidate → nothing to do.
   */
  @Transactional
  fun fillMissingOpen(candidateId: UUID, openPrice: BigDecimal) {
    val userId = authService.getCurrentUser().id
    for (stat in repo.findByUserIdAndCandidateIdIn(userId, listOf(candidateId))) {
      if (stat.isDoubleTop) {
        if (stat.dtStartPrice != null) continue
        stat.dtStartPrice = openPrice
      } else {
        if (stat.openPrice != null) continue
        stat.openPrice = openPrice
      }
      stat.updatedAt = Instant.now()
    }
  }
}
