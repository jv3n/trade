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
 * Stats service — the sheet filled as the day goes and ticked once complete (cf.
 * `mockup/PARCOURS.md`, step 5).
 *
 * Every stat **belongs to a user** since #187 : there is no shared community dataset and no RADAR /
 * MANUAL / IMPORT source any more. Reads, edits and deletes are user-scoped and a
 * missing-or-foreign id returns 404 (never 403) so we don't leak existence — same contract as the
 * journal / candidates / account.
 *
 * **One stat per (user, day, ticker)** — creating a second one is a 409 ; the DB unique constraint
 * `ux_stat_entry_user_day_ticker` is the race-safe backstop.
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
   * complete, the average push at open, LOD and EOD, the median / 3rd quartile / max push at open,
   * and how many faded at the close. Percentages are recomputed from the prices ([StatMetrics]) —
   * none of them is stored.
   */
  @Transactional(readOnly = true)
  fun summarise(filter: StatEntryFilter): StatSummaryDto {
    val userId = authService.getCurrentUser().id
    val rows = repo.findAll(StatEntrySpecifications.matching(userId, filter))
    val completed = rows.filter { it.isCompleted }
    // The journal's "8 of 10 stats traded" KPI (#195) : one query for the whole filtered set,
    // the same read the listing already uses row by row.
    val traded = tradeEntryService.tradeLinksByStat(rows.map { it.id }).size
    val pushes = completed.mapNotNull { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) }
    return StatSummaryDto(
      completed = completed.size,
      toComplete = rows.size - completed.size,
      averagePushOpenPercent =
        completed.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) },
      medianPushOpenPercent = StatMetrics.quantile(pushes, MEDIAN),
      thirdQuartilePushOpenPercent = StatMetrics.quantile(pushes, THIRD_QUARTILE),
      maxPushOpenPercent = pushes.maxOrNull(),
      noPushCount = completed.count { it.noPush },
      averageLodPercent =
        completed.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.lodPrice) },
      fadeCount = completed.count { it.eodPrice!! < it.openPrice!! },
      traded = traded,
      untraded = rows.size - traded,
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

  /**
   * Gives the stat born from [candidateId] the [openPrice] typed on the candidate at 9:30 — for a
   * candidate promoted before the open. A stat that already has an open keeps it : the one typed on
   * the stat wins. No stat for that candidate → nothing to do.
   */
  @Transactional
  fun fillMissingOpen(candidateId: UUID, openPrice: BigDecimal) {
    val userId = authService.getCurrentUser().id
    val stat =
      repo.findByUserIdAndCandidateIdIn(userId, listOf(candidateId)).firstOrNull() ?: return
    if (stat.openPrice != null) return
    stat.openPrice = openPrice
    stat.updatedAt = Instant.now()
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
   * Overwrites a stat — the session panel sends the whole row back each time a field is left
   * (premarket recap + session prices + flags), so any subset of the session may come in. Renaming
   * onto a (day, ticker) the caller already has is a 409. A ticked stat keeps its tick but can't
   * lose a price : that is a 400, untick it first.
   */
  @Transactional
  fun update(id: UUID, request: StatEntryRequest): StatEntryDto {
    val entry = loadOwned(id)
    val ticker = request.cleanTicker()
    requireFree(entry.user.id, request, ticker, ownId = entry.id)
    entry.apply(request, ticker)
    if (entry.isCompleted && !entry.hasFullSession) {
      throw badRequest(
        "Stat ${entry.ticker} is completed — untick it before clearing " +
          entry.missingSessionPrices.joinToString(", ")
      )
    }
    entry.updatedAt = Instant.now()
    val saved = repo.save(entry)
    // The completion panel replaces its row with this response — dropping the link would make the
    // « → Trade » button reappear on a stat that already has its trade.
    return saved.toDto(tradeEntryService.tradeLinksByStat(listOf(saved.id))[saved.id])
  }

  /**
   * Ticks a stat as completed, or unticks it back to "to complete" — the ✓ of the sheet (#263).
   * Ticking needs the session prices — four on a « no push » day — (400 naming the missing ones) ;
   * ticking twice keeps the first date. Unticking is always allowed.
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
    if (completed) {
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
    val open = request.openPrice?.requirePositive("Open")
    val push = if (request.noPush) null else request.pushOpenPrice?.requirePositive("Push at open")
    val eod = request.eodPrice?.requirePositive("EOD")
    requireInsideTheDay(hod, lod, listOf("Open" to open, "Push at open" to push, "EOD" to eod))

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

    openPrice = open
    pushOpenPrice = push
    hodPrice = hod
    lodPrice = lod
    eodPrice = eod

    ssr = request.ssr
    under1Dollar = request.under1Dollar
    entryAfter11am = request.entryAfter11am
    noPush = request.noPush
    highInstitutions = request.highInstitutions
  }

  private fun StatEntryRequest.cleanTicker(): String =
    ticker.trim().uppercase().ifEmpty { throw badRequest("Ticker must not be blank") }

  /**
   * The day's range holds every price it contains (#305) : `LOD <= open, push, EOD <= HOD`. The HOD
   * / LOD pair was checked, the three prices inside were not — a stat could carry a HOD of 1 under
   * a push of 10 and still be ticked.
   */
  private fun requireInsideTheDay(
    hod: BigDecimal?,
    lod: BigDecimal?,
    prices: List<Pair<String, BigDecimal?>>,
  ) {
    if (hod != null && lod != null && hod < lod) throw badRequest("HOD must not be below the LOD")
    for ((label, price) in prices) {
      if (price == null) continue
      if (hod != null && price > hod) throw badRequest("$label must not be above the HOD")
      if (lod != null && price < lod) throw badRequest("$label must not be below the LOD")
    }
  }

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
    val MEDIAN = BigDecimal("0.5")
    val THIRD_QUARTILE = BigDecimal("0.75")
  }
}
