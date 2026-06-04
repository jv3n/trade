package com.portfolioai.journal.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.application.dto.toDto
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntrySpecifications
import java.time.Instant
import java.util.UUID
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * CRUD service for the trading journal — every read/write is scoped to the current user via
 * [AuthService.getCurrentUser]. The repository methods all carry the userId predicate as a second
 * line of defence so a buggy controller (or a unit test) can't accidentally leak rows across
 * tenants.
 *
 * Missing-or-foreign-id → HTTP 404 (rather than 403) so we don't leak the existence of an entry
 * that belongs to someone else.
 */
@Service
class TradeEntryService(
  private val repo: TradeEntryRepository,
  private val authService: AuthService,
) {

  @Transactional(readOnly = true)
  fun findAll(filter: TradeEntryFilter = TradeEntryFilter()): List<TradeEntryDto> {
    val userId = authService.getCurrentUser().id
    val spec = TradeEntrySpecifications.matching(userId, filter)
    // Default sort `tradeDate desc, createdAt desc` matches the frontend's expectation that
    // today's freshest trades sit at the top. The frontend handles further sorting in memory
    // (MatSort) since the journal is small.
    val sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
    return repo.findAll(spec, sort).map { it.toDto() }
  }

  @Transactional(readOnly = true) fun findById(id: UUID): TradeEntryDto = loadOwned(id).toDto()

  @Transactional
  fun create(request: TradeEntryRequest): TradeEntryDto {
    val user = authService.getCurrentUser()
    val entry =
      TradeEntry(
        user = user,
        tradeDate = request.tradeDate,
        ticker = request.ticker.trim().uppercase(),
        play = request.play,
        pattern = request.pattern,
        size = request.size,
        openPrice = request.openPrice,
        exitPrice = request.exitPrice,
        profitDollars = request.profitDollars,
        gainPercent = request.gainPercent,
        note = request.note,
        pre935To10h = request.pre935To10h,
        preGapUp50 = request.preGapUp50,
        prePrice1To10 = request.prePrice1To10,
        preFloat3To50m = request.preFloat3To50m,
        preWaitPush = request.preWaitPush,
        openSide = request.openSide,
        shortOnResistance = request.shortOnResistance,
        exitStrategy = request.exitStrategy,
        errorNote = request.errorNote,
      )
    return repo.save(entry).toDto()
  }

  @Transactional
  fun update(id: UUID, request: TradeEntryRequest): TradeEntryDto {
    val entry = loadOwned(id)
    entry.tradeDate = request.tradeDate
    entry.ticker = request.ticker.trim().uppercase()
    entry.play = request.play
    entry.pattern = request.pattern
    entry.size = request.size
    entry.openPrice = request.openPrice
    entry.exitPrice = request.exitPrice
    entry.profitDollars = request.profitDollars
    entry.gainPercent = request.gainPercent
    entry.note = request.note
    entry.pre935To10h = request.pre935To10h
    entry.preGapUp50 = request.preGapUp50
    entry.prePrice1To10 = request.prePrice1To10
    entry.preFloat3To50m = request.preFloat3To50m
    entry.preWaitPush = request.preWaitPush
    entry.openSide = request.openSide
    entry.shortOnResistance = request.shortOnResistance
    entry.exitStrategy = request.exitStrategy
    entry.errorNote = request.errorNote
    entry.updatedAt = Instant.now()
    return repo.save(entry).toDto()
  }

  @Transactional
  fun delete(id: UUID) {
    val userId = authService.getCurrentUser().id
    val removed = repo.deleteByIdAndUserId(id, userId)
    if (removed == 0L) {
      throw ResponseStatusException(HttpStatus.NOT_FOUND, "Trade entry $id not found")
    }
  }

  private fun loadOwned(id: UUID): TradeEntry {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Trade entry $id not found")
  }
}
