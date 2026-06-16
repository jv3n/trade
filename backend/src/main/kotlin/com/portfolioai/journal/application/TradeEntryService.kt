package com.portfolioai.journal.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.journal.application.dto.ImportResult
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.application.dto.toDto
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntrySpecifications
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
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
  private val events: ApplicationEventPublisher,
) {

  @Transactional(readOnly = true)
  fun findAll(filter: TradeEntryFilter = TradeEntryFilter()): List<TradeEntryDto> {
    val userId = authService.getCurrentUser().id
    val spec = TradeEntrySpecifications.matching(userId, filter)
    // Default sort `tradeDate desc, createdAt desc` matches the frontend's expectation that
    // today's freshest trades sit at the top.
    val sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
    return repo.findAll(spec, sort).map { it.toDto() }
  }

  /**
   * Paginated variant of [findAll].
   *
   * **Sort resolution** — the sort that lands on the JPA query is owned **here**, not by Spring's
   * `@PageableDefault` resolver. The controller passes through whatever Spring built from the URL
   * `sort` params (or empty if none). This service then : • Uses the URL sort when the client
   * provided one. • Falls back to [DEFAULT_SORT] (`tradeDate desc, createdAt desc`) when the client
   * sent no `sort` param — so the table always opens on the latest trades.
   *
   * The previous setup leant on `@PageableDefault(sort = …, direction = DESC)` on the controller
   * but the resolver behaviour with multiple URL `sort` params (primary + tie-breaker) was
   * inconsistent in practice — the URL sort wasn't taking effect. Owning the decision in the
   * service is bug-proof and trivially testable.
   *
   * The CSV export path stays on the unpaged [findAll] / dedicated [exportAllAsCsv] — a paged
   * export would force the importer to handle chunks.
   */
  @Transactional(readOnly = true)
  fun findAllPaged(
    filter: TradeEntryFilter = TradeEntryFilter(),
    pageable: Pageable,
  ): Page<TradeEntryDto> {
    val userId = authService.getCurrentUser().id
    val spec = TradeEntrySpecifications.matching(userId, filter)
    val effective =
      if (pageable.sort.isUnsorted)
        PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
      else pageable
    return repo.findAll(spec, effective).map { it.toDto() }
  }

  companion object {
    /** Used as the implicit sort when the client doesn't send any `sort` URL param. */
    private val DEFAULT_SORT: Sort =
      Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
  }

  @Transactional(readOnly = true) fun findById(id: UUID): TradeEntryDto = loadOwned(id).toDto()

  /**
   * CSV dump of every trade for the current user, ordered by tradeDate desc then createdAt desc
   * (same order as [findAll]). Returned as a single UTF-8 string ; the controller wraps it in a
   * `text/csv` attachment response with a dated filename. Roundtrip-safe with the future importer —
   * column layout owned by [TradeEntryCsvEncoder].
   */
  @Transactional(readOnly = true)
  fun exportAllAsCsv(): String {
    val userId = authService.getCurrentUser().id
    val spec = TradeEntrySpecifications.matching(userId, TradeEntryFilter())
    val sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
    val entries: List<TradeEntry> = repo.findAll(spec, sort)
    return TradeEntryCsvEncoder.encode(entries)
  }

  /**
   * Imports a CSV string produced by [TradeEntryCsvEncoder] (or hand-edited from an export).
   *
   * **Atomic batch** — if [TradeEntryCsvDecoder] surfaces any per-row error, **no** trade is
   * persisted (`created = 0`, `errors` carries the line-level diagnostics). On a clean decode the
   * whole batch is saved in a single transaction and `created == parsed`.
   *
   * The decoder accepts the same column layout the encoder emits, ignores UTF-8 BOM and tolerates
   * CRLF / LF line endings.
   */
  @Transactional
  fun importCsv(csv: String): ImportResult {
    val decoded = TradeEntryCsvDecoder.decode(csv)
    if (decoded.errors.isNotEmpty()) {
      return ImportResult(parsed = decoded.rows.size, created = 0, errors = decoded.errors)
    }
    val user = authService.getCurrentUser()
    for (request in decoded.rows) {
      val entry =
        TradeEntry(
          user = user,
          tradeDate = request.tradeDate,
          ticker = request.ticker,
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
          statEntryId = request.statEntryId,
        )
      publishChange(repo.saveAndFlush(entry))
    }
    return ImportResult(
      parsed = decoded.rows.size,
      created = decoded.rows.size,
      errors = emptyList(),
    )
  }

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
        statEntryId = request.statEntryId,
      )
    val saved = repo.saveAndFlush(entry)
    publishChange(saved)
    return saved.toDto()
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
    entry.statEntryId = request.statEntryId
    entry.updatedAt = Instant.now()
    val saved = repo.saveAndFlush(entry)
    publishChange(saved)
    return saved.toDto()
  }

  @Transactional
  fun delete(id: UUID) {
    val userId = authService.getCurrentUser().id
    val removed = repo.deleteByIdAndUserId(id, userId)
    if (removed == 0L) {
      throw ResponseStatusException(HttpStatus.NOT_FOUND, "Trade entry $id not found")
    }
  }

  /**
   * Notifies the `account` context so it can sync the trade's realized P&L as a read-only `TRADE`
   * movement. Fired on create / update / import ; deletion is handled by the DB `ON DELETE
   * CASCADE`.
   */
  private fun publishChange(entry: TradeEntry) {
    events.publishEvent(
      TradeChangedEvent(
        tradeId = entry.id,
        userId = entry.user.id,
        ticker = entry.ticker,
        tradeDate = entry.tradeDate,
        profitDollars = entry.profitDollars,
      )
    )
  }

  private fun loadOwned(id: UUID): TradeEntry {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Trade entry $id not found")
  }
}
