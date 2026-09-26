package com.portfolioai.stats.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.User
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryDto
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.shared.Pattern
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
    val page = repo.findAll(spec, effective)
    // One query for the whole page rather than one per row — same shape as the candidates listing.
    val links = tradeEntryService.tradeLinksByStat(page.content.map { it.id })
    return page.map { it.toDto(links[it.id]) }
  }

  /**
   * KPIs over the **whole filtered set**, not the current page : how many stats are completed / to
   * complete, the average push at open, LOD and EOD, the median / 3rd quartile / max push at open,
   * and how many faded at the close — on the GUS-measured stats — plus the three legs of the
   * completed double tops. Percentages are recomputed from the prices ([StatMetrics]) — none of
   * them is stored.
   */
  @Transactional(readOnly = true)
  fun summarise(filter: StatEntryFilter): StatSummaryDto {
    val userId = authService.getCurrentUser().id
    val rows = repo.findAll(StatEntrySpecifications.matching(userId, filter))
    val completed = rows.filter { it.isCompleted }
    val sessions = completed.filterNot { it.isDoubleTop }
    val doubleTops = completed.filter { it.isDoubleTop }
    // The journal's "8 of 10 stats traded" KPI (#195) : one query for the whole filtered set,
    // the same read the listing already uses row by row.
    val traded = tradeEntryService.tradeLinksByStat(rows.map { it.id }).size
    val pushes = sessions.mapNotNull { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) }
    return StatSummaryDto(
      completed = completed.size,
      toComplete = rows.size - completed.size,
      averagePushOpenPercent =
        sessions.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.pushOpenPrice) },
      medianPushOpenPercent = StatMetrics.quantile(pushes, MEDIAN),
      thirdQuartilePushOpenPercent = StatMetrics.quantile(pushes, THIRD_QUARTILE),
      maxPushOpenPercent = pushes.maxOrNull(),
      noPushCount = sessions.count { it.noPush },
      averageLodPercent =
        sessions.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.lodPrice) },
      fadeCount = sessions.count { it.eodPrice!! < it.openPrice!! },
      averageEodPercent =
        sessions.averageOf { StatMetrics.percentVsOpen(it.openPrice, it.eodPrice) },
      completedDoubleTops = doubleTops.size,
      averageExtensionPercent =
        doubleTops.averageOf { StatMetrics.percentChange(it.dtStartPrice, it.dtTopPrice) },
      averageExtensionWithGapPercent =
        doubleTops.averageOf { StatMetrics.percentChange(it.previousClose, it.dtTopPrice) },
      averageRejectionPercent =
        doubleTops.averageOf { StatMetrics.percentChange(it.dtTopPrice, it.dtLowPrice) },
      rejectionAtCriterionCount =
        doubleTops.count {
          StatMetrics.percentChange(it.dtTopPrice, it.dtLowPrice)!! <= -DT_REJECTION_CRITERION
        },
      averageRetestPercent =
        doubleTops.averageOf { StatMetrics.percentChange(it.dtLowPrice, it.dtRetestPrice) },
      averageRetestToTopPercent =
        doubleTops.averageOf { StatMetrics.percentChange(it.dtTopPrice, it.dtRetestPrice) },
      retestTookTopCount = doubleTops.count { it.dtRetestPrice!! >= it.dtTopPrice!! },
      traded = traded,
      untraded = rows.size - traded,
    )
  }

  /**
   * The stats each of these candidates became, by pattern (#434) — the "in stats" badges of the
   * candidates listing (#383) and the guard against promoting twice in one pattern (#189). A
   * candidate never promoted is absent. Read exposed to the `candidates` context through this
   * application service, the way cross-context reads are done here.
   */
  @Transactional(readOnly = true)
  fun statIdsByCandidate(candidateIds: Collection<UUID>): Map<UUID, Map<Pattern, UUID>> {
    if (candidateIds.isEmpty()) return emptyMap()
    val userId = authService.getCurrentUser().id
    return repo
      .findByUserIdAndCandidateIdIn(userId, candidateIds)
      .filter { it.candidateId != null }
      .groupBy { it.candidateId!! }
      .mapValues { (_, stats) -> stats.associate { it.pattern to it.id } }
  }

  /**
   * Whether the caller's sheet already holds a stat for that (day, ticker, pattern). Lets
   * `candidates` skip a taken slot **before** calling [create] : catching the 409 instead would
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
    entry.apply(born, ticker)
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
    entry.apply(request, ticker)
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
    return saved.toDto(tradeEntryService.tradeLinksByStat(listOf(saved.id))[saved.id])
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

  /**
   * Validates [request] and copies it onto this stat (ticker already cleaned). A double top keeps
   * its four prices and drops the GUS session (and « no push ») ; any other pattern the reverse.
   */
  private fun StatEntry.apply(request: StatEntryRequest, cleanTicker: String) {
    val pmOpen = request.pmOpen.requirePositive("PM open")
    val pmHigh = request.pmHigh.requirePositive("PM high")
    if (pmHigh < pmOpen) throw badRequest("PM high must not be below the PM open")
    val doubleTop = request.pattern == Pattern.DT
    val gus = !doubleTop
    val hod = request.hodPrice?.takeIf { gus }?.requirePositive("HOD")
    val lod = request.lodPrice?.takeIf { gus }?.requirePositive("LOD")
    val open = request.openPrice?.takeIf { gus }?.requirePositive("Open")
    val noPush = gus && request.noPush
    val push =
      if (noPush) null else request.pushOpenPrice?.takeIf { gus }?.requirePositive("Push at open")
    val eod = request.eodPrice?.takeIf { gus }?.requirePositive("EOD")
    requireInsideTheDay(hod, lod, listOf("Open" to open, "Push at open" to push, "EOD" to eod))
    val dtStart = request.dtStartPrice?.takeIf { doubleTop }?.requirePositive("Start")
    val dtTop = request.dtTopPrice?.takeIf { doubleTop }?.requirePositive("Top")
    val dtLow = request.dtLowPrice?.takeIf { doubleTop }?.requirePositive("Rejection low")
    val dtRetest = request.dtRetestPrice?.takeIf { doubleTop }?.requirePositive("Retest")
    requireDoubleTopShape(dtStart, dtTop, dtLow, dtRetest)

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
    dtStartPrice = dtStart
    dtTopPrice = dtTop
    dtLowPrice = dtLow
    dtRetestPrice = dtRetest

    ssr = request.ssr
    under1Dollar = request.under1Dollar
    entryAfter11am = request.entryAfter11am
    this.noPush = noPush
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

  /**
   * The shape of a double top (`docs/pattern/DT.md`) : the top not under the start, the rejection
   * low not above the top, the retest not under the low. Each pair is checked once both are in.
   */
  private fun requireDoubleTopShape(
    start: BigDecimal?,
    top: BigDecimal?,
    low: BigDecimal?,
    retest: BigDecimal?,
  ) {
    if (start != null && top != null && top < start) {
      throw badRequest("Top must not be below the start")
    }
    if (top != null && low != null && low > top) {
      throw badRequest("Rejection low must not be above the top")
    }
    if (low != null && retest != null && retest < low) {
      throw badRequest("Retest must not be below the rejection low")
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
    /** The rejection that makes a double top, per `docs/pattern/DT.md` — below, a normal breath. */
    val DT_REJECTION_CRITERION = BigDecimal("17")
  }
}
