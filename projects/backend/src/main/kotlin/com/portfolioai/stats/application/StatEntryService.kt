package com.portfolioai.stats.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.shared.Pattern
import com.portfolioai.shared.badRequest
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.application.dto.StatSummaryDto
import com.portfolioai.stats.application.dto.toDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatMetrics
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import com.portfolioai.stats.infrastructure.persistence.StatEntrySpecifications
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Stats service — the sheet filled as the day goes and ticked once complete (cf.
 * `mockup/PARCOURS.md`, step 5).
 *
 * Every stat **belongs to a user** since #187 : there is no shared community dataset and no RADAR /
 * MANUAL / IMPORT source any more. Reads, edits and deletes are user-scoped and a
 * missing-or-foreign id returns 404 (never 403) so we don't leak existence — same contract as the
 * journal / candidates / account.
 *
 * **One stat per (user, day, ticker, pattern)** — creating a second one is a 409 ; the DB unique
 * constraint `ux_stat_entry_user_day_ticker_pattern` is the race-safe backstop (#434). A double top
 * is a stat of its own : re-filing a stat to or from DT is a 400.
 *
 * A stat is born from a candidate (the promotion action, #189, through [create]) or typed by hand
 * for a chart found afterwards, on any day up to today ([createByHand], #326). The CSV leg is
 * **export only**.
 */
@Service
class StatEntryService(
  private val repo: StatEntryRepository,
  private val authService: AuthService,
  private val tradeEntryService: TradeEntryService,
  private val events: ApplicationEventPublisher,
) {

  // ---- Listing -------------------------------------------------------------------------------

  /**
   * Paginated listing, scoped to the caller and narrowed by [filter]. The sort default lives here
   * (not in `@PageableDefault`) so a URL `sort` is always honoured — same pattern as
   * `TradeEntryService.findAllPaged`.
   */
  @Transactional(readOnly = true)
  fun findAllPaged(filter: StatEntryFilter, pageable: Pageable): Page<StatEntryDto> {
    val userId = authService.getCurrentUser().id
    val spec = StatEntrySpecifications.matching(userId, filter)
    val effective =
      if (pageable.sort.isUnsorted)
        PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
      else pageable
    val page =
      if (filter.hasDerived) derivedPage(spec, effective, filter) else repo.findAll(spec, effective)
    // One query for the whole page rather than one per row — same shape as the candidates listing.
    val links = tradeEntryService.tradeLinksByStat(page.content.map { it.id })
    return page.map { it.toDto(links[it.id].orEmpty()) }
  }

  /**
   * The derived toggles (#499) page in memory : their rules live on [StatEntry], and a copy in SQL
   * could drift from them. A personal sheet holds a few hundred stats a year.
   */
  private fun derivedPage(
    spec: Specification<StatEntry>,
    pageable: Pageable,
    filter: StatEntryFilter,
  ): Page<StatEntry> {
    val rows = repo.findAll(spec, pageable.sort).filter(filter::matchesDerived)
    val from = minOf(pageable.offset.toInt(), rows.size)
    val to = minOf(from + pageable.pageSize, rows.size)
    return PageImpl(rows.subList(from, to), pageable, rows.size.toLong())
  }

  /**
   * KPIs over the **whole filtered set**, not the current page : how many stats are completed / to
   * complete, the average / median / 3rd quartile / max push at open, the median LOD, EOD, hold and
   * cumulative readings (#499), and how many faded at the close — on the session-measured stats —
   * plus the three legs of the completed double tops. Percentages are recomputed from the prices
   * ([StatMetrics]) — none of them is stored.
   *
   * **Averages need a pattern** (#512) : each pattern is measured on its own stats, so without one
   * in the filter only the counts are computed (completed, to complete, traded) and every average
   * stays empty. A GUS and the stat born from it (#507) share the day's open, LOD and EOD : mixed,
   * that ticker-day would count twice.
   */
  @Transactional(readOnly = true)
  fun summarise(filter: StatEntryFilter): StatSummaryDto {
    val userId = authService.getCurrentUser().id
    val rows =
      repo.findAll(StatEntrySpecifications.matching(userId, filter)).filter(filter::matchesDerived)
    // The journal's "8 of 10 stats traded" KPI (#195) : one query for the whole filtered set,
    // the same read the listing already uses row by row. Keyed by stat, so a stat traded three
    // times still counts once (#500).
    val traded = tradeEntryService.tradeLinksByStat(rows.map { it.id }).size
    return statSummaryOf(rows, filter.pattern, traded)
  }

  // ---- CRUD (user-scoped) --------------------------------------------------------------------

  @Transactional(readOnly = true)
  fun findById(id: UUID): StatEntryDto {
    val entry = loadOwned(id)
    return entry.toDto(tradeEntryService.tradeLinksByStat(listOf(entry.id))[entry.id].orEmpty())
  }

  // ---- Promotion to the journal (#193) --------------------------------------------------------

  /**
   * Creates a trade on this stat — the « → Trade » / « + Trade » action, cf. `mockup/PARCOURS.md`
   * step 4. The trade inherits the stat's date, ticker and pattern and starts empty : direction,
   * executions, real P&L, post-mortem and screenshot are typed on the trade page afterwards.
   *
   * **As many as I take** (#500) : each call creates the next one, and nothing ever splits a trade
   * — where a trade ends is mine to say. A trade under another pattern goes through another stat.
   */
  @Transactional
  fun promoteToTrade(id: UUID): TradeEntryDto {
    val stat = loadOwned(id)
    return tradeEntryService.create(
      TradeEntryRequest(
        statEntryId = stat.id,
        tradeDate = stat.tradeDate,
        ticker = stat.ticker,
        pattern = stat.pattern,
      )
    )
  }

  /**
   * « Same ticker, another pattern » (#507) — a stat born from [id] : same day, same ticker, same
   * source candidate, and the [pattern] picked among the free ones. **The day's prices are carried
   * over** — premarket, open, push at the open (or « no push »), HOD / LOD / EOD, float, volume,
   * and the flags that describe the day (SSR, under $1, institutions) : they belong to the day, not
   * to the setup, so a session-measured sibling is completable as born (#517) and two stats of one
   * day never disagree about what the stock did. What is specific to a pattern starts empty : the
   * double-top prices (a double top starts from the open, as when it is born from a candidate, and
   * keeps none of the session), the note. A pattern the day and ticker already have is a 409.
   */
  @Transactional
  fun createSibling(id: UUID, pattern: Pattern): StatEntryDto {
    val source = loadOwned(id)
    return create(source.siblingRequest(pattern), candidateId = source.candidateId)
  }

  /** The patterns [id]'s day and ticker don't have a stat for yet — what a sibling can take. */
  @Transactional(readOnly = true)
  fun freePatterns(id: UUID): List<Pattern> {
    val source = loadOwned(id)
    val taken =
      repo
        .findByUserIdAndTradeDateAndTicker(source.user.id, source.tradeDate, source.ticker)
        .map { it.pattern }
        .toSet()
    return Pattern.entries.filterNot { it in taken }
  }

  /**
   * A stat typed by hand on the stats page (#326) — a ticker that matched the pattern a few days
   * ago and never made it to the candidates. Any day up to today : a future day is a 400. Same
   * rules as any stat otherwise, and no source candidate.
   */
  @Transactional
  fun createByHand(request: StatEntryRequest): StatEntryDto {
    if (request.tradeDate.isAfter(LocalDate.now())) {
      throw badRequest("A stat can't be dated in the future (${request.tradeDate})")
    }
    return create(request)
  }

  /**
   * Creates a stat for the caller — the promotion of a candidate (#189), or [createByHand].
   * [candidateId] keeps the trace of the source candidate. A (day, ticker, pattern) already in the
   * sheet is a 409. A double top born with an open starts from it, unless a start is sent.
   */
  @Transactional
  fun create(request: StatEntryRequest, candidateId: UUID? = null): StatEntryDto {
    val user = authService.getCurrentUser()
    val ticker = request.cleanTicker()
    requireFree(user.id, request, ticker, ownId = null)
    val entry = newEntry(user, request, ticker, candidateId)
    val born =
      if (request.pattern == Pattern.DT && request.dtStartPrice == null) {
        request.copy(dtStartPrice = request.openPrice)
      } else request
    entry.fillFrom(born, ticker)
    // Flushed here so a race lost on a unique constraint surfaces as the 409 of
    // `GlobalExceptionHandler`, not as a failed commit.
    return repo.saveAndFlush(entry).toDto()
  }

  /**
   * Overwrites a stat — the session panel sends the whole row back each time a field is left
   * (premarket recap + session prices + flags), so any subset of the session may come in. Renaming
   * onto a (day, ticker, pattern) the caller already has is a 409. A ticked stat keeps its tick but
   * can't lose a price : that is a 400, untick it first. Re-filing to or from DT is a 400 : a GUS
   * that becomes a double top is a second stat (#434).
   */
  @Transactional
  fun update(id: UUID, request: StatEntryRequest): StatEntryDto {
    val entry = loadOwned(id)
    val ticker = request.cleanTicker()
    val previousPattern = entry.pattern
    if (
      request.pattern != previousPattern && Pattern.DT in setOf(request.pattern, previousPattern)
    ) {
      throw badRequest(
        "Stat ${entry.ticker} can't be re-filed from $previousPattern to ${request.pattern} — " +
          "a double top is a stat of its own"
      )
    }
    requireFree(entry.user.id, request, ticker, ownId = entry.id)
    entry.fillFrom(request, ticker)
    if (entry.isCompleted && !entry.hasFullSession) {
      throw badRequest(
        "Stat ${entry.ticker} is completed — untick it before clearing " +
          entry.missingSessionPrices.joinToString(", ")
      )
    }
    entry.updatedAt = Instant.now()
    val saved = repo.save(entry)
    if (saved.pattern != previousPattern) {
      events.publishEvent(StatPatternChangedEvent(saved.id, saved.user.id, saved.pattern))
    }
    // The completion panel replaces its row with this response — dropping the link would make the
    // « → Trade » button reappear on a stat that already has its trade.
    return saved.toDto(tradeEntryService.tradeLinksByStat(listOf(saved.id))[saved.id].orEmpty())
  }

  /**
   * Ticks a stat as completed, or unticks it back to "to complete" — the ✓ of the sheet (#263).
   * Ticking needs the session prices of its pattern — four on a « no push » day, the four prices of
   * a double top — (400 naming the missing ones) ; ticking twice keeps the first date. Unticking is
   * always allowed.
   */
  @Transactional
  fun setCompleted(id: UUID, completed: Boolean): StatEntryDto {
    val entry = loadOwned(id)
    if (completed && !entry.hasFullSession) {
      throw badRequest(
        "Stat ${entry.ticker} can't be completed yet — missing " +
          entry.missingSessionPrices.joinToString(", ")
      )
    }
    // Rows written before the range rule existed (#305) can hold an impossible set : the ✓ replays
    // it rather than blessing what a write would refuse today.
    if (completed && entry.isDoubleTop) {
      requireDoubleTopShape(
        entry.dtStartPrice,
        entry.dtTopPrice,
        entry.dtLowPrice,
        entry.dtRetestPrice,
      )
      requireDoubleTopTimesInOrder(
        entry.dtStartTime,
        entry.dtTopTime,
        entry.dtLowTime,
        entry.dtRetestTime,
      )
    } else if (completed) {
      requireInsideTheDay(
        entry.hodPrice,
        entry.lodPrice,
        listOf(
          "Open" to entry.openPrice,
          "Push at open" to entry.pushOpenPrice,
          "EOD" to entry.eodPrice,
        ),
      )
    }
    entry.completedAt = if (completed) entry.completedAt ?: Instant.now() else null
    entry.updatedAt = Instant.now()
    val saved = repo.save(entry)
    return saved.toDto(tradeEntryService.tradeLinksByStat(listOf(saved.id))[saved.id].orEmpty())
  }

  /**
   * Deletes a stat, **keeping its trades** (#635) : the journal unlinks them first, through
   * [StatDeletedEvent], and they stay with their P&L and account line — trades on their own.
   * Deleting them would throw away the P&L the account is built on ; it is how the stats invented
   * for an import go away.
   */
  @Transactional
  fun delete(id: UUID) {
    val entry = loadOwned(id)
    events.publishEvent(StatDeletedEvent(entry.id, entry.user.id))
    repo.delete(entry)
  }

  // ---- CSV export ----------------------------------------------------------------------------

  /** Exports the caller's stats as a CSV string (cf. [StatEntryCsvEncoder]), newest-first. */
  @Transactional(readOnly = true)
  fun exportAllAsCsv(): String {
    val userId = authService.getCurrentUser().id
    return StatEntryCsvEncoder.encode(repo.findByUserId(userId, DEFAULT_SORT))
  }

  // ---- Internals -----------------------------------------------------------------------------

  private fun loadOwned(id: UUID): StatEntry {
    val userId = authService.getCurrentUser().id
    return repo.findByIdAndUserId(id, userId)
      ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Stat entry $id not found")
  }

  /** 409 when another stat of the same user already holds (day, ticker, pattern). */
  private fun requireFree(userId: UUID, request: StatEntryRequest, ticker: String, ownId: UUID?) {
    val existing =
      repo.findByUserIdAndTradeDateAndTickerAndPattern(
        userId,
        request.tradeDate,
        ticker,
        request.pattern,
      )
    if (existing != null && existing.id != ownId) {
      throw ResponseStatusException(
        HttpStatus.CONFLICT,
        "Stat $ticker ${request.pattern} already exists on ${request.tradeDate}",
      )
    }
  }

  private companion object {
    /** Newest-first, `createdAt` tiebreaker. Export order + implicit listing sort. */
    val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
  }
}
