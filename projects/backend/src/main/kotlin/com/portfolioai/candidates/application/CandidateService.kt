package com.portfolioai.candidates.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.candidates.application.dto.BulkPromotionDto
import com.portfolioai.candidates.application.dto.CandidateDto
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.candidates.domain.Candidate
import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Candidates service — the morning capture (cf. `mockup/PARCOURS.md › Étape 1`). Everything is
 * scoped to the current user, and a missing-or-foreign id → 404 (never 403) so we don't leak
 * existence — same contract as the journal / account.
 *
 * **One candidate per (day, ticker)** : creating — or renaming onto — a ticker already captured
 * that day is a 409. The check runs in-service for a precise message ; the DB unique constraint
 * `ux_candidate_user_day_ticker` stays the safety net. Validation is in-service too : a blank
 * ticker, a non-positive price, a PM high below the PM open or a negative float / volume / locate
 * return a clean 400 rather than reaching the DB CHECK constraints.
 */
@Service
class CandidateService(
  private val repo: CandidateRepository,
  private val authService: AuthService,
  private val statEntryService: StatEntryService,
) {

  /** A day's candidates (default today), ticker-ascending — the front sorts by gap. */
  @Transactional(readOnly = true)
  fun listForDate(date: LocalDate?): List<CandidateDto> {
    val userId = authService.getCurrentUser().id
    val candidates =
      repo.findByUserIdAndTradingDateOrderByTickerAsc(userId, date ?: LocalDate.now())
    // One query for the whole day rather than one per row.
    val promoted = statEntryService.promotedCandidateIds(candidates.map { it.id })
    return candidates.map { it.toDto(promoted = it.id in promoted) }
  }

  @Transactional(readOnly = true)
  fun findById(id: UUID): CandidateDto {
    val candidate = loadOwned(id)
    return candidate.toDto(
      promoted = candidate.id in statEntryService.promotedCandidateIds(listOf(id))
    )
  }

  // ---- Promotion to the stats sheet (#189) ---------------------------------------------------

  /**
   * Copies a candidate onto the stats sheet — the « → Stat » action, cf. `mockup/PARCOURS.md`
   * step 2. The stat takes the whole premarket block and starts "to complete" ; the candidate keeps
   * a trace through `stat_entry.candidate_id` and shows as promoted from then on.
   *
   * Promoting twice is a **409**, so the bulk action below stays idempotent. A stat that already
   * exists for that (day, ticker) without coming from this candidate is a 409 too — raised by
   * `StatEntryService`.
   */
  @Transactional
  fun promote(id: UUID): StatEntryDto {
    val candidate = loadOwned(id)
    if (candidate.id in statEntryService.promotedCandidateIds(listOf(candidate.id))) {
      throw ResponseStatusException(
        HttpStatus.CONFLICT,
        "Candidate ${candidate.ticker} is already in the stats sheet",
      )
    }
    return statEntryService.create(candidate.toStatRequest(), candidateId = candidate.id)
  }

  /**
   * Promotes every candidate of a day that isn't in the stats sheet yet — « Tout passer en stats ».
   * Idempotent by construction : already-promoted candidates are skipped, and a candidate whose
   * (day, ticker) slot is taken by another stat is reported as skipped rather than failing the
   * whole batch.
   */
  @Transactional
  fun promoteDay(date: LocalDate?): BulkPromotionDto {
    val userId = authService.getCurrentUser().id
    val day = date ?: LocalDate.now()
    val candidates = repo.findByUserIdAndTradingDateOrderByTickerAsc(userId, day)
    val alreadyPromoted = statEntryService.promotedCandidateIds(candidates.map { it.id })

    val promoted = mutableListOf<String>()
    val skipped = mutableListOf<String>()
    for (candidate in candidates) {
      // Both conditions are checked **before** calling `create` : letting it throw the 409 would
      // mark this transaction rollback-only and take the whole batch down with it.
      if (
        candidate.id in alreadyPromoted ||
          statEntryService.existsForDayAndTicker(candidate.tradingDate, candidate.ticker)
      ) {
        skipped += candidate.ticker
        continue
      }
      statEntryService.create(candidate.toStatRequest(), candidateId = candidate.id)
      promoted += candidate.ticker
    }
    return BulkPromotionDto(promoted = promoted, skipped = skipped)
  }

  @Transactional
  fun create(request: CandidateRequest): CandidateDto {
    val user = authService.getCurrentUser()
    val ticker = request.cleanTicker()
    requireFree(user.id, request.tradingDate, ticker, ownId = null)
    val candidate =
      Candidate(
        user = user,
        tradingDate = request.tradingDate,
        ticker = ticker,
        previousClose = request.previousClose,
        pmOpen = request.pmOpen,
        pmHigh = request.pmHigh,
      )
    candidate.apply(request, ticker)
    return repo.save(candidate).toDto()
  }

  @Transactional
  fun update(id: UUID, request: CandidateRequest): CandidateDto {
    val candidate = loadOwned(id)
    val ticker = request.cleanTicker()
    requireFree(candidate.user.id, request.tradingDate, ticker, ownId = candidate.id)
    candidate.apply(request, ticker)
    candidate.updatedAt = Instant.now()
    return repo.save(candidate).toDto()
  }

  @Transactional fun delete(id: UUID) = repo.delete(loadOwned(id))

  private fun loadOwned(id: UUID): Candidate {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Candidate $id not found")
  }

  /** 409 when another candidate of the same user already holds (day, ticker). */
  private fun requireFree(userId: UUID, date: LocalDate, ticker: String, ownId: UUID?) {
    val existing = repo.findByUserIdAndTradingDateAndTicker(userId, date, ticker)
    if (existing != null && existing.id != ownId) {
      throw ResponseStatusException(
        HttpStatus.CONFLICT,
        "Candidate $ticker already captured on $date",
      )
    }
  }

  /** Validates [request] and copies it onto this candidate (ticker already cleaned). */
  private fun Candidate.apply(request: CandidateRequest, cleanTicker: String) {
    val pmOpen = request.pmOpen.requirePositive("PM open")
    val pmHigh = request.pmHigh.requirePositive("PM high")
    if (pmHigh < pmOpen) throw badRequest("PM high must not be below the PM open")
    tradingDate = request.tradingDate
    pattern = request.pattern
    ticker = cleanTicker
    previousClose = request.previousClose.requirePositive("Previous close")
    this.pmOpen = pmOpen
    this.pmHigh = pmHigh
    floatMillions = request.floatMillions?.requireNonNegative("Float")
    volumeMillions = request.volumeMillions?.requireNonNegative("Volume")
    locatePerShare = request.locatePerShare?.requireNonNegative("Locate")
    note = request.note?.trim()?.ifEmpty { null }
  }

  /**
   * The premarket block a promotion copies onto the stats sheet. The session block stays empty —
   * that is what makes the new stat "to complete" — and the flags default to false.
   */
  private fun Candidate.toStatRequest(): StatEntryRequest =
    StatEntryRequest(
      tradeDate = tradingDate,
      pattern = pattern,
      ticker = ticker,
      previousClose = previousClose,
      pmOpen = pmOpen,
      pmHigh = pmHigh,
      floatMillions = floatMillions,
      volumeMillions = volumeMillions,
      locatePerShare = locatePerShare,
      note = note,
    )

  private fun Candidate.toDto(promoted: Boolean = false): CandidateDto =
    CandidateDto(
      id = id,
      tradingDate = tradingDate,
      pattern = pattern,
      ticker = ticker,
      previousClose = previousClose,
      pmOpen = pmOpen,
      pmHigh = pmHigh,
      floatMillions = floatMillions,
      volumeMillions = volumeMillions,
      locatePerShare = locatePerShare,
      note = note,
      promoted = promoted,
      createdAt = createdAt,
      updatedAt = updatedAt,
    )

  private fun CandidateRequest.cleanTicker(): String =
    ticker.trim().uppercase().ifEmpty { throw badRequest("Ticker must not be blank") }

  private fun BigDecimal.requirePositive(label: String): BigDecimal = also {
    if (it.signum() <= 0) throw badRequest("$label must be greater than zero")
  }

  private fun BigDecimal.requireNonNegative(label: String): BigDecimal = also {
    if (it.signum() < 0) throw badRequest("$label must not be negative")
  }

  private fun badRequest(message: String) = ResponseStatusException(HttpStatus.BAD_REQUEST, message)
}
