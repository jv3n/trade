package com.portfolioai.journal.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.User
import com.portfolioai.journal.application.dto.JournalDayDto
import com.portfolioai.journal.application.dto.JournalSummaryDto
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.application.dto.TradeLinkDto
import com.portfolioai.journal.application.dto.toDto
import com.portfolioai.journal.application.dto.toLinkDto
import com.portfolioai.journal.domain.OutOfPatternStats
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.domain.TradePositionCalculator
import com.portfolioai.journal.domain.TradePositionCalculator.PositionStatus
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntrySpecifications
import com.portfolioai.shared.Pattern
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
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
  private val outOfPatternStats: OutOfPatternStats,
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

  /**
   * The journal's rows (#500) : the filtered trades folded into one row per ticker and day, sorted
   * and paged as rows — a page of ten is ten ticker-days, however many trades they hold. The filter
   * applies to the trades first, so a row only carries the trades that match it.
   *
   * Grouped in memory, like [summarise] : a personal journal counts in the hundreds of trades a
   * year, and grouping in SQL would duplicate the retained-P&L and duration rules. The sort
   * properties are the row's own (see [JournalDays.comparator]) ; the default puts the latest day
   * first.
   */
  @Transactional(readOnly = true)
  fun findDaysPaged(filter: TradeEntryFilter, pageable: Pageable): Page<JournalDayDto> {
    val userId = authService.getCurrentUser().id
    val trades = repo.findAll(TradeEntrySpecifications.matching(userId, filter))
    val days = JournalDays.group(trades).sortedWith(JournalDays.comparator(pageable.sort))
    if (pageable.isUnpaged) return PageImpl(days)
    val from = minOf(pageable.offset.toInt(), days.size)
    val to = minOf(from + pageable.pageSize, days.size)
    return PageImpl(days.subList(from, to), pageable, days.size.toLong())
  }

  /**
   * KPIs over the **whole filtered set**, not the current page : realized P&L, win rate, average
   * win / loss and profit factor (#195), and the P&L of the trades taken on out-of-pattern stats
   * beside the in-rules one (#499). Loads the filtered rows and folds them in memory — a personal
   * journal counts in the hundreds of rows a year, and the alternative (four aggregate queries)
   * would duplicate the retained-P&L rule in SQL.
   */
  @Transactional(readOnly = true)
  fun summarise(filter: TradeEntryFilter): JournalSummaryDto {
    val userId = authService.getCurrentUser().id
    return journalSummaryOf(
      repo.findAll(TradeEntrySpecifications.matching(userId, filter)),
      outOfPatternStats,
    )
  }

  companion object {
    /** Used as the implicit sort when the client doesn't send any `sort` URL param. */
    private val DEFAULT_SORT: Sort =
      Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
  }

  @Transactional(readOnly = true) fun findById(id: UUID): TradeEntryDto = loadOwned(id).toDto()

  /**
   * The caller's trades born from these stats, keyed by stat id, each stat's in the day's order —
   * several per stat since #500 ; a stat without a trade has no key. Read exposed to the `stats`
   * context through this application service, the way cross-context reads are done here : the stats
   * listing shows a link per trade, counts the traded stats, and refuses to delete a stat while any
   * of its trades exists.
   */
  @Transactional(readOnly = true)
  fun tradeLinksByStat(statEntryIds: Collection<UUID>): Map<UUID, List<TradeLinkDto>> {
    if (statEntryIds.isEmpty()) return emptyMap()
    val userId = authService.getCurrentUser().id
    return repo
      .findByUserIdAndStatEntryIdIn(userId, statEntryIds)
      .groupBy { it.statEntryId }
      .mapValues { (_, trades) -> trades.sortedWith(TradeEntry.DAY_ORDER).map { it.toLinkDto() } }
  }

  /**
   * Moves the trades born from [statEntryId] onto their stat's new [pattern] (#393) — the stat was
   * re-filed, and its trades follow. No trade yet is a no-op. Driven by `StatPatternChangedEvent`.
   */
  @Transactional
  fun followStatPattern(statEntryId: UUID, userId: UUID, pattern: Pattern) {
    repo.findByUserIdAndStatEntryIdIn(userId, listOf(statEntryId)).forEach {
      it.pattern = pattern
      it.updatedAt = Instant.now()
    }
  }

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
   * Creates a trade for the caller. Its only callers are the stat promotion (#193 — `stats` hands
   * over the stat's identity) and the CSV import : the journal has no create endpoint of its own, a
   * trade is always born from a stat.
   */
  @Transactional
  fun create(request: TradeEntryRequest): TradeEntryDto {
    val entry = newEntry(authService.getCurrentUser(), request)
    applyExecutions(entry, request)
    val saved = repo.saveAndFlush(entry)
    publishChange(saved)
    return saved.toDto()
  }

  @Transactional
  fun update(id: UUID, request: TradeEntryRequest): TradeEntryDto {
    val entry = loadOwned(id)
    entry.statEntryId = request.statEntryId
    entry.tradeDate = request.tradeDate
    entry.ticker = request.ticker.trim().uppercase()
    entry.pattern = request.pattern ?: Pattern.GUS
    entry.realProfitDollars = request.realProfitDollars
    entry.note = request.note
    entry.errorNote = request.errorNote
    applyExecutions(entry, request)
    entry.updatedAt = Instant.now()
    val saved = repo.saveAndFlush(entry)
    publishChange(saved)
    return saved.toDto()
  }

  @Transactional
  fun delete(id: UUID) {
    val entry = loadOwned(id)
    // Announce the removal (profitDollars = null) *before* deleting the trade so the account
    // context
    // drops the linked TRADE movement and re-floats the latest balance correction — a deletion
    // moves
    // the balance just like an edit. The movement goes first (child FK), so the DB ON DELETE
    // CASCADE
    // on trade_entry_id is left only as a safety net. Same synchronous, same-transaction contract.
    events.publishEvent(
      TradeChangedEvent(
        tradeId = entry.id,
        userId = entry.user.id,
        ticker = entry.ticker,
        tradeDate = entry.tradeDate,
        profitDollars = null,
      )
    )
    repo.delete(entry)
  }

  /**
   * Rewrites the [entry]'s executions + direction from the [request] and recomputes the derived
   * aggregates (size, avg prices, realized P&L, gain%) via [TradePositionCalculator] — the single
   * place where the aggregates are recomputed. Per-leg positivity and a real P&L on a closed
   * position only are validated here (→ HTTP 400), so a bad input never reaches the DB CHECK
   * constraints (which would surface as a 409).
   */
  private fun applyExecutions(entry: TradeEntry, request: TradeEntryRequest) {
    val legs =
      request.executions.map { exec ->
        require(exec.shares > 0) { "Execution shares must be positive, got ${exec.shares}" }
        require(exec.price > BigDecimal.ZERO) {
          "Execution price must be positive, got ${exec.price.toPlainString()}"
        }
        TradePositionCalculator.Leg(
          kind = exec.kind,
          shares = exec.shares,
          price = exec.price,
          executedAt = exec.executedAt,
        )
      }
    val aggregates = TradePositionCalculator.compute(request.direction, legs)
    // The broker's P&L is read off a closed trade : on an open or partial position it would post
    // an amount to the account that no exit backs (#304).
    require(request.realProfitDollars == null || aggregates.status == PositionStatus.CLOSED) {
      "The broker P&L can only be set once the position is closed"
    }
    entry.direction = request.direction
    entry.replaceExecutions(legs)
    entry.applyAggregates(aggregates)
  }

  /**
   * A brand-new trade from its [request] — the stat-borne identity (stat link, date, ticker,
   * pattern) plus the post-mortem and the real P&L. The executions are applied separately by
   * [applyExecutions], which also derives the flat aggregates.
   */
  private fun newEntry(user: User, request: TradeEntryRequest) =
    TradeEntry(
      user = user,
      statEntryId = request.statEntryId,
      tradeDate = request.tradeDate,
      ticker = request.ticker.trim().uppercase(),
      pattern = request.pattern ?: Pattern.GUS,
      realProfitDollars = request.realProfitDollars,
      note = request.note,
      errorNote = request.errorNote,
    )

  /**
   * Notifies the `account` context so it can sync the trade's P&L as a read-only `TRADE` movement.
   * The figure published is the **retained** one (the broker's real P&L when it has been typed in,
   * the computed one otherwise) — the balance must match the broker statement to the cent, which is
   * the whole point of the real-P&L override (#192). Fired on create / update / import ; deletion
   * publishes a null P&L first (see [delete]).
   */
  private fun publishChange(entry: TradeEntry) {
    events.publishEvent(
      TradeChangedEvent(
        tradeId = entry.id,
        userId = entry.user.id,
        ticker = entry.ticker,
        tradeDate = entry.tradeDate,
        profitDollars = entry.retainedProfit,
        direction = entry.direction,
        size = entry.size,
      )
    )
  }

  private fun loadOwned(id: UUID): TradeEntry {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Trade entry $id not found")
  }
}
