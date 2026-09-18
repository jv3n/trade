package com.portfolioai.candidates.application

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.auth.application.AuthService
import com.portfolioai.candidates.application.dto.CandidateDto
import com.portfolioai.candidates.application.dto.CandidateEntry
import com.portfolioai.candidates.application.dto.CandidateExit
import com.portfolioai.candidates.application.dto.CandidateFill
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
 * Candidates service — the persisted backing of the short-trade preparation cockpit. One candidate
 * per ticker the trader sets up ; everything is scoped to the current user, and a
 * missing-or-foreign id → 404 (never 403) so we don't leak existence — same contract as the journal
 * / account.
 *
 * **Date-driven lifecycle** : [listForDate] feeds the dropdown with a single day's candidates
 * (default today). Older candidates stay in the DB but off the picker — there is no status field.
 *
 * The entry-fill and cover ladders ride as JSON on the row ; this service is the only place that
 * marshals them to / from typed `List<CandidateFill>` / `List<CandidateExit>` (Hibernate stays out
 * of the JSON business, à la `MarketScreenerService`). Validation is in-service : a blank ticker, a
 * non-positive price / capital, or an out-of-range risk % return a clean 400 rather than reaching
 * the DB CHECK constraints.
 */
@Service
class CandidateService(
  private val repo: CandidateRepository,
  private val authService: AuthService,
  private val jsonMapper: ObjectMapper,
) {

  // Captured once — Jackson reflects on these tokens to know the generic shape on read.
  private val fillsTypeRef = object : TypeReference<List<CandidateFill>>() {}
  private val entriesTypeRef = object : TypeReference<List<CandidateEntry>>() {}
  private val exitsTypeRef = object : TypeReference<List<CandidateExit>>() {}

  /** The day's candidates for the dropdown (default today), ticker-ascending. */
  @Transactional(readOnly = true)
  fun listForDate(date: LocalDate?): List<CandidateDto> {
    val userId = authService.getCurrentUser().id
    return repo.findByUserIdAndTradingDateOrderByTickerAsc(userId, date ?: LocalDate.now()).map {
      it.toDto()
    }
  }

  @Transactional(readOnly = true) fun findById(id: UUID): CandidateDto = loadOwned(id).toDto()

  /**
   * Saves a candidate as an **upsert keyed on (user, tradingDate, ticker)** : if a candidate
   * already exists for that session + ticker it is updated, otherwise a new one is created.
   * Changing the ticker therefore targets a *different* candidate rather than overwriting the
   * loaded one.
   */
  @Transactional
  fun create(request: CandidateRequest): CandidateDto {
    val user = authService.getCurrentUser()
    val ticker = request.cleanTicker()
    val totalCapital = request.totalCapital.requirePositive("Total capital")
    val pct = request.pctCapitalAtRisk.requirePercent()
    val open = request.openPrice.requirePositive("Open price")
    val candidate =
      repo.findByUserIdAndTradingDateAndTicker(user.id, request.tradingDate, ticker)
        ?: Candidate(
          user = user,
          tradingDate = request.tradingDate,
          ticker = ticker,
          totalCapital = totalCapital,
          pctCapitalAtRisk = pct,
          openPrice = open,
        )
    candidate.tradingDate = request.tradingDate
    candidate.ticker = ticker
    candidate.totalCapital = totalCapital
    candidate.pctCapitalAtRisk = pct
    candidate.openPrice = open
    candidate.stopPct = request.stopPct
    candidate.previousClose = request.previousClose
    candidate.floatShares = request.floatShares
    candidate.volume = request.volume
    candidate.morningPush = request.morningPush
    candidate.borrowCostPerShare = request.borrowCostPerShare
    candidate.fillsJson = jsonMapper.writeValueAsString(request.fills)
    candidate.entriesJson = jsonMapper.writeValueAsString(request.entries)
    candidate.exitsJson = jsonMapper.writeValueAsString(request.exits)
    candidate.note = request.note.cleanNote()
    candidate.updatedAt = Instant.now()
    return repo.save(candidate).toDto()
  }

  @Transactional
  fun update(id: UUID, request: CandidateRequest): CandidateDto {
    val candidate = loadOwned(id)
    candidate.tradingDate = request.tradingDate
    candidate.ticker = request.cleanTicker()
    candidate.totalCapital = request.totalCapital.requirePositive("Total capital")
    candidate.pctCapitalAtRisk = request.pctCapitalAtRisk.requirePercent()
    candidate.openPrice = request.openPrice.requirePositive("Open price")
    candidate.stopPct = request.stopPct
    candidate.previousClose = request.previousClose
    candidate.floatShares = request.floatShares
    candidate.volume = request.volume
    candidate.morningPush = request.morningPush
    candidate.borrowCostPerShare = request.borrowCostPerShare
    candidate.fillsJson = jsonMapper.writeValueAsString(request.fills)
    candidate.entriesJson = jsonMapper.writeValueAsString(request.entries)
    candidate.exitsJson = jsonMapper.writeValueAsString(request.exits)
    candidate.note = request.note.cleanNote()
    candidate.updatedAt = Instant.now()
    return repo.save(candidate).toDto()
  }

  @Transactional fun delete(id: UUID) = repo.delete(loadOwned(id))

  private fun loadOwned(id: UUID): Candidate {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Candidate $id not found")
  }

  private fun Candidate.toDto(): CandidateDto =
    CandidateDto(
      id = id,
      tradingDate = tradingDate,
      ticker = ticker,
      totalCapital = totalCapital,
      pctCapitalAtRisk = pctCapitalAtRisk,
      openPrice = openPrice,
      stopPct = stopPct,
      previousClose = previousClose,
      floatShares = floatShares,
      volume = volume,
      morningPush = morningPush,
      borrowCostPerShare = borrowCostPerShare,
      fills = jsonMapper.readValue(fillsJson, fillsTypeRef),
      entries = jsonMapper.readValue(entriesJson, entriesTypeRef),
      exits = jsonMapper.readValue(exitsJson, exitsTypeRef),
      note = note,
      createdAt = createdAt,
      updatedAt = updatedAt,
    )

  private fun CandidateRequest.cleanTicker(): String =
    ticker.trim().uppercase().ifEmpty { throw badRequest("Ticker must not be blank") }

  private fun BigDecimal.requirePositive(label: String): BigDecimal = also {
    if (it.signum() <= 0) throw badRequest("$label must be greater than zero")
  }

  private fun BigDecimal.requirePercent(): BigDecimal = also {
    if (it.signum() <= 0 || it > HUNDRED) throw badRequest("Capital at risk % must be in (0, 100]")
  }

  private fun String?.cleanNote(): String? = this?.trim()?.ifEmpty { null }

  private fun badRequest(message: String) = ResponseStatusException(HttpStatus.BAD_REQUEST, message)

  private companion object {
    val HUNDRED: BigDecimal = BigDecimal(100)
  }
}
