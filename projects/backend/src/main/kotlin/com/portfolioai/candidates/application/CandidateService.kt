package com.portfolioai.candidates.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.candidates.application.dto.CandidateDto
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.candidates.domain.Candidate
import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
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
) {

  /** A day's candidates (default today), ticker-ascending — the front sorts by gap. */
  @Transactional(readOnly = true)
  fun listForDate(date: LocalDate?): List<CandidateDto> {
    val userId = authService.getCurrentUser().id
    return repo.findByUserIdAndTradingDateOrderByTickerAsc(userId, date ?: LocalDate.now()).map {
      it.toDto()
    }
  }

  @Transactional(readOnly = true) fun findById(id: UUID): CandidateDto = loadOwned(id).toDto()

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

  private fun Candidate.toDto(): CandidateDto =
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
