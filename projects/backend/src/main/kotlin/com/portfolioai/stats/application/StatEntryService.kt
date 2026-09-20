package com.portfolioai.stats.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.User
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.application.dto.StatSummaryDto
import com.portfolioai.stats.application.dto.toDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatMetrics
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import com.portfolioai.stats.infrastructure.persistence.StatEntrySpecifications
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Stats service — the sheet completed after the 4 pm close (cf. `mockup/PARCOURS.md`, step 5).
 *
 * Every stat **belongs to a user** since #187 : there is no shared community dataset and no RADAR /
 * MANUAL / IMPORT source any more. Reads, edits and deletes are user-scoped and a
 * missing-or-foreign id returns 404 (never 403) so we don't leak existence — same contract as the
 * journal / candidates / account.
 *
 * **One stat per (user, day, ticker)** — creating a second one is a 409 ; the DB unique constraint
 * `ux_stat_entry_user_day_ticker` is the race-safe backstop.
 *
 * Creating a stat is a copy of a candidate (the promotion action, #189) : this service exposes
 * [create], the HTTP layer has no create endpoint. The CSV leg is **export only**.
 */
@Service
class StatEntryService(
  private val repo: StatEntryRepository,
  private val authService: AuthService,
  private val tradeEntryService: TradeEntryService,
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
    val page = repo.findAll(spec, effective)
    // One query for the whole page rather than one per row — same shape as the candidates listing.
    val links = tradeEntryService.tradeLinksByStat(page.content.map { it.id })
    return page.map { it.toDto(links[it.id]) }
  }

  /**
   * KPIs over the **whole filtered set**, not the current page : how many stats are completed / to
   * complete, the average push at open, LOD and EOD, and how many faded at the close. Percentages
   * are recomputed from the prices ([StatMetrics]) — none of them is stored.
   */
  @Transactional(readOnly = true)
  fun summarise(filter: StatEntryFilter): StatSummaryDto {
    val userId = authService.getCurrentUser().id
    val rows = repo.findAll(StatEntrySpecifications.matching(userId, filter))
    val completed = rows.filter { it.isCompleted }
    return StatSummaryDto(
      completed = completed.size,
      toComplete = rows.size - completed.size,
      averagePushOpenPercent =
        completed.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) },
      averageLodPercent =
        completed.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.lodPrice) },
      fadeCount = completed.count { it.eodPrice!! < it.openPrice!! },
      averageEodPercent =
        completed.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.eodPrice) },
    )
  }

  /**
   * Which of these candidates already have a stat — the "in stats" flag of the candidates listing
   * and the guard against promoting twice (#189). Read exposed to the `candidates` context through
   * this application service, the way cross-context reads are done here.
   */
  @Transactional(readOnly = true)
  fun promotedCandidateIds(candidateIds: Collection<UUID>): Set<UUID> {
    if (candidateIds.isEmpty()) return emptySet()
    val userId = authService.getCurrentUser().id
    return repo
      .findByUserIdAndCandidateIdIn(userId, candidateIds)
      .mapNotNull { it.candidateId }
      .toSet()
  }

  /**
   * Whether the caller's sheet already holds a stat for that (day, ticker). Lets `candidates` skip
   * a taken slot **before** calling [create] : catching the 409 instead would mark the surrounding
   * transaction rollback-only, and the bulk promotion would fail as a whole.
   */
  @Transactional(readOnly = true)
  fun existsForDayAndTicker(tradeDate: LocalDate, ticker: String): Boolean {
    val userId = authService.getCurrentUser().id
    return repo.findByUserIdAndTradeDateAndTicker(userId, tradeDate, ticker.trim().uppercase()) !=
      null
  }

  // ---- CRUD (user-scoped) --------------------------------------------------------------------

  @Transactional(readOnly = true)
  fun findById(id: UUID): StatEntryDto {
    val entry = loadOwned(id)
    return entry.toDto(tradeEntryService.tradeLinksByStat(listOf(entry.id))[entry.id])
  }

  // ---- Promotion to the journal (#193) --------------------------------------------------------

  /**
   * Creates the trade this stat gave birth to — the « → Trade » action, cf. `mockup/PARCOURS.md`
   * step 4. The trade inherits the stat's date, ticker and pattern and starts empty : executions,
   * real P&L, post-mortem and screenshot are typed on the trade page afterwards.
   *
   * **One trade per stat** : a second call is a 409, and the listing shows a link to the existing
   * trade instead of the button from then on. The unique index `ux_trade_entry_stat_entry_id` is
   * the race-safe backstop.
   */
  @Transactional
  fun promoteToTrade(id: UUID): TradeEntryDto {
    val stat = loadOwned(id)
    val existing = tradeEntryService.tradeLinksByStat(listOf(stat.id))[stat.id]
    if (existing != null) {
      throw ResponseStatusException(
        HttpStatus.CONFLICT,
        "Stat ${stat.ticker} already has a trade in the journal",
      )
    }
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
   * Creates a stat for the caller — the promotion of a candidate (#189) is its only caller.
   * [candidateId] keeps the trace of the source candidate. A (day, ticker) already in the sheet is
   * a 409.
   */
  @Transactional
  fun create(request: StatEntryRequest, candidateId: UUID? = null): StatEntryDto {
    val user = authService.getCurrentUser()
    val ticker = request.cleanTicker()
    requireFree(user.id, request, ticker, ownId = null)
    val entry = newEntry(user, request, ticker, candidateId)
    entry.apply(request, ticker)
    return repo.save(entry).toDto()
  }

  /**
   * Overwrites a stat — the completion panel sends the whole row back (premarket recap + session
   * prices + flags). Renaming onto a (day, ticker) the caller already has is a 409.
   */
  @Transactional
  fun update(id: UUID, request: StatEntryRequest): StatEntryDto {
    val entry = loadOwned(id)
    val ticker = request.cleanTicker()
    requireFree(entry.user.id, request, ticker, ownId = entry.id)
    entry.apply(request, ticker)
    entry.updatedAt = Instant.now()
    val saved = repo.save(entry)
    // The completion panel replaces its row with this response — dropping the link would make the
    // « → Trade » button reappear on a stat that already has its trade.
    return saved.toDto(tradeEntryService.tradeLinksByStat(listOf(saved.id))[saved.id])
  }

  /**
   * Deletes a stat. A stat that gave birth to a trade is a **409** : the FK is ON DELETE RESTRICT
   * (#192), so letting it reach the DB would surface as a 500 — and deleting the trade silently
   * would throw away the P&L the account is built on. The trade goes first, from the journal.
   */
  @Transactional
  fun delete(id: UUID) {
    val entry = loadOwned(id)
    if (tradeEntryService.tradeLinksByStat(listOf(entry.id)).isNotEmpty()) {
      throw ResponseStatusException(
        HttpStatus.CONFLICT,
        "Stat ${entry.ticker} has a trade in the journal — delete the trade first",
      )
    }
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

  /** 409 when another stat of the same user already holds (day, ticker). */
  private fun requireFree(userId: UUID, request: StatEntryRequest, ticker: String, ownId: UUID?) {
    val existing = repo.findByUserIdAndTradeDateAndTicker(userId, request.tradeDate, ticker)
    if (existing != null && existing.id != ownId) {
      throw ResponseStatusException(
        HttpStatus.CONFLICT,
        "Stat $ticker already exists on ${request.tradeDate}",
      )
    }
  }

  /** A blank shell — [apply] does the validation and fills every field right after. */
  private fun newEntry(user: User, request: StatEntryRequest, ticker: String, candidateId: UUID?) =
    StatEntry(
      user = user,
      candidateId = candidateId,
      tradeDate = request.tradeDate,
      ticker = ticker,
      previousClose = request.previousClose,
      pmOpen = request.pmOpen,
      pmHigh = request.pmHigh,
    )

  /** Validates [request] and copies it onto this stat (ticker already cleaned). */
  private fun StatEntry.apply(request: StatEntryRequest, cleanTicker: String) {
    val pmOpen = request.pmOpen.requirePositive("PM open")
    val pmHigh = request.pmHigh.requirePositive("PM high")
    if (pmHigh < pmOpen) throw badRequest("PM high must not be below the PM open")
    val hod = request.hodPrice?.requirePositive("HOD")
    val lod = request.lodPrice?.requirePositive("LOD")
    if (hod != null && lod != null && hod < lod) throw badRequest("HOD must not be below the LOD")

    tradeDate = request.tradeDate
    pattern = request.pattern
    ticker = cleanTicker
    previousClose = request.previousClose.requirePositive("Previous close")
    this.pmOpen = pmOpen
    this.pmHigh = pmHigh
    floatMillions = request.floatMillions?.requireNonNegative("Float")
    volumeMillions = request.volumeMillions?.requireNonNegative("Volume")
    locatePerShare = request.locatePerShare?.requireNonNegative("Locate")
    note = request.note?.trim()?.ifEmpty { null }

    openPrice = request.openPrice?.requirePositive("Open")
    pushOpenPrice = request.pushOpenPrice?.requirePositive("Push at open")
    hodPrice = hod
    lodPrice = lod
    eodPrice = request.eodPrice?.requirePositive("EOD")

    ssr = request.ssr
    under1Dollar = request.under1Dollar
    entryAfter11am = request.entryAfter11am
  }

  private fun StatEntryRequest.cleanTicker(): String =
    ticker.trim().uppercase().ifEmpty { throw badRequest("Ticker must not be blank") }

  private fun BigDecimal.requirePositive(label: String): BigDecimal = also {
    if (it.signum() <= 0) throw badRequest("$label must be greater than zero")
  }

  private fun BigDecimal.requireNonNegative(label: String): BigDecimal = also {
    if (it.signum() < 0) throw badRequest("$label must not be negative")
  }

  private fun badRequest(message: String) = ResponseStatusException(HttpStatus.BAD_REQUEST, message)

  /** Average of a derived percentage over the rows that yield one ; null when none does. */
  private fun List<StatEntry>.averageOf(metric: (StatEntry) -> BigDecimal?): BigDecimal? {
    val values = mapNotNull(metric)
    if (values.isEmpty()) return null
    return values.reduce(BigDecimal::add).divide(BigDecimal(values.size), 2, RoundingMode.HALF_UP)
  }

  private companion object {
    /** Newest-first, `createdAt` tiebreaker. Export order + implicit listing sort. */
    val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
  }
}
