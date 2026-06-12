package com.portfolioai.stats.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.stats.application.dto.ImportResult
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryFormRequest
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.application.dto.toDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatMetrics
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import com.portfolioai.stats.infrastructure.persistence.StatEntrySpecifications
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
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
 * Stats import / export / CRUD service.
 *
 * Since V2 the dataset is **admin-global + per-user** : the ADMIN CSV import feeds the shared
 * community rows ([StatSource.IMPORT], `createdBy = null`), while any authenticated user owns their
 * radar / manual analyses ([StatSource.RADAR] / [StatSource.MANUAL]). Reads are scoped — a user
 * sees the global rows + their own (cf. [StatEntrySpecifications.matching]). CRUD is
 * **ownership-scoped** : a user can only edit / delete their own rows ; IMPORT rows (and other
 * users') return 404.
 *
 * **Uniqueness is per owner** — one analysis per (day, ticker, owner). Creating for a (day, ticker)
 * the caller already has **upserts** (overwrites) the existing row ; the DB unique index
 * (`ux_stat_entry_day_ticker_owner`) is the race-safe backstop.
 */
@Service
class StatEntryService(
  private val repo: StatEntryRepository,
  private val authService: AuthService,
) {

  // ---- Listing -------------------------------------------------------------------------------

  /**
   * Paginated listing, scoped to what the current user may see (global rows + their own) and
   * narrowed by [filter]. Sort default owned here (not `@PageableDefault`) so a URL `sort` is
   * always honoured — same pattern as `TradeEntryService.findAllPaged`.
   */
  @Transactional(readOnly = true)
  fun findAllPaged(filter: StatEntryFilter, pageable: Pageable): Page<StatEntryDto> {
    val userId = authService.getCurrentUser().id
    val spec = StatEntrySpecifications.matching(userId, filter)
    val effective =
      if (pageable.sort.isUnsorted)
        PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
      else pageable
    return repo.findAll(spec, effective).map { it.toDto() }
  }

  // ---- CRUD (owner-scoped) -------------------------------------------------------------------

  /**
   * Creates a user-owned stat from the radar button ([StatSource.RADAR]) or the manual dialog
   * ([StatSource.MANUAL], the default). Upserts on (day, ticker, caller) — a second create for the
   * same day/ticker overwrites the caller's existing row rather than erroring. [StatSource.IMPORT]
   * is rejected (only the CSV import path may create it).
   */
  @Transactional
  fun create(form: StatEntryFormRequest): StatEntryDto {
    val source = form.source ?: StatSource.MANUAL
    if (source == StatSource.IMPORT) {
      throw ResponseStatusException(
        HttpStatus.BAD_REQUEST,
        "source IMPORT is reserved for the CSV import",
      )
    }
    val userId = authService.getCurrentUser().id
    val tradeDate = form.tradeDate ?: LocalDate.now(MARKET_ZONE)
    val ticker = form.ticker.trim().uppercase()
    val existing = repo.findByTradeDateAndTickerAndCreatedBy(tradeDate, ticker, userId)
    val entry =
      existing
        ?: StatEntry(
          tradeDate = tradeDate,
          ticker = ticker,
          gapUpPercent = form.gapUpPercent,
          openPrice = form.openPrice,
        )
    applyForm(entry, form, tradeDate, ticker)
    entry.source = source
    entry.createdBy = userId
    if (existing != null) entry.updatedAt = Instant.now()
    return repo.save(entry).toDto()
  }

  /**
   * Edits one of the caller's own rows. Ownership-scoped : a row the caller doesn't own (incl.
   * every IMPORT row, `created_by = null`) returns 404 — never 403, so we don't leak existence. A
   * unique collision (editing date/ticker onto another of the caller's rows) surfaces as a
   * `DataIntegrityViolationException` → 409 via `GlobalExceptionHandler`.
   */
  @Transactional
  fun update(id: UUID, form: StatEntryFormRequest): StatEntryDto {
    val userId = authService.getCurrentUser().id
    val entry =
      repo.findByIdAndCreatedBy(id, userId)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Stat entry $id not found")
    val tradeDate = form.tradeDate ?: entry.tradeDate
    val ticker = form.ticker.trim().uppercase()
    entry.gapUpPercent = form.gapUpPercent
    entry.openPrice = form.openPrice
    applyForm(entry, form, tradeDate, ticker)
    entry.updatedAt = Instant.now()
    return repo.save(entry).toDto()
  }

  /** Deletes one of the caller's own rows. Not-owned (IMPORT or someone else's) → 404. */
  @Transactional
  fun delete(id: UUID) {
    val userId = authService.getCurrentUser().id
    val removed = repo.deleteByIdAndCreatedBy(id, userId)
    if (removed == 0L) {
      throw ResponseStatusException(HttpStatus.NOT_FOUND, "Stat entry $id not found")
    }
  }

  /**
   * Copies the form fields onto [entry] and (re)computes the derived `%push` / `%LOD` / `%EOD` —
   * only when the levels they need are present, else null (a radar pick has no EOD outcome yet).
   * [tradeDate] / [ticker] are passed in already normalised.
   */
  private fun applyForm(
    entry: StatEntry,
    form: StatEntryFormRequest,
    tradeDate: LocalDate,
    ticker: String,
  ) {
    entry.tradeDate = tradeDate
    entry.ticker = ticker
    entry.gapUpPercent = form.gapUpPercent
    entry.openPrice = form.openPrice
    entry.floatSharesMillions = form.floatSharesMillions
    entry.institutionsPercent = form.institutionsPercent
    entry.instOver20 = form.instOver20
    entry.under1Dollar = form.under1Dollar
    entry.ssr = form.ssr
    entry.entryAfter11am = form.entryAfter11am
    entry.note = form.note?.takeIf { it.isNotBlank() }
    entry.highPrice = form.highPrice
    entry.lodPrice = form.lodPrice
    entry.eodPrice = form.eodPrice
    entry.pushPercent = form.highPrice?.let { StatMetrics.pushPercent(form.openPrice, it) }
    entry.lodPercent = form.lodPrice?.let { StatMetrics.lodPercent(form.openPrice, it) }
    entry.eodPercent = form.eodPrice?.let { StatMetrics.eodPercent(form.openPrice, it) }
  }

  // ---- CSV import / export -------------------------------------------------------------------

  /**
   * Imports a stats CSV (cf. `docs/data-input/stats-demo.csv`). ADMIN-gated at the HTTP layer.
   *
   * **Atomic batch** — any per-row decode error → nothing persisted. Each clean row **upserts** the
   * global community slot (day, ticker, `created_by = null`) : a re-import overwrites the prior
   * community analysis rather than colliding on the unique index. Imported rows are
   * [StatSource.IMPORT]. Derived `%push` / `%LOD` / `%EOD` computed from the levels.
   */
  @Transactional
  fun importCsv(csv: String): ImportResult {
    val decoded = StatEntryCsvDecoder.decode(csv)
    if (decoded.errors.isNotEmpty()) {
      return ImportResult(parsed = decoded.rows.size, created = 0, errors = decoded.errors)
    }
    for (request in decoded.rows) {
      val existing =
        repo.findByTradeDateAndTickerAndCreatedByIsNull(request.tradeDate, request.ticker)
      val entry =
        existing
          ?: StatEntry(
            tradeDate = request.tradeDate,
            ticker = request.ticker,
            gapUpPercent = request.gapUpPercent,
            openPrice = request.openPrice,
          )
      applyImport(entry, request)
      if (existing != null) entry.updatedAt = Instant.now()
      repo.save(entry)
    }
    return ImportResult(
      parsed = decoded.rows.size,
      created = decoded.rows.size,
      errors = emptyList(),
    )
  }

  /**
   * Exports the **global/admin community** rows as a CSV string (cf. [StatEntryCsvEncoder]),
   * newest-first. Scoped to `created_by IS NULL` so the export stays roundtrip-safe : the community
   * rows are complete, while the per-user radar/manual rows never leave through the CSV.
   */
  @Transactional(readOnly = true)
  fun exportAllAsCsv(): String =
    StatEntryCsvEncoder.encode(repo.findByCreatedByIsNull(DEFAULT_SORT))

  private fun applyImport(entry: StatEntry, r: StatEntryRequest) {
    entry.tradeDate = r.tradeDate
    entry.ticker = r.ticker
    entry.gapUpPercent = r.gapUpPercent
    entry.floatSharesMillions = r.floatSharesMillions
    entry.institutionsPercent = r.institutionsPercent
    entry.instOver20 = r.instOver20
    entry.under1Dollar = r.under1Dollar
    entry.ssr = r.ssr
    entry.entryAfter11am = r.entryAfter11am
    entry.note = r.note
    entry.openPrice = r.openPrice
    entry.highPrice = r.highPrice
    entry.lodPrice = r.lodPrice
    entry.eodPrice = r.eodPrice
    entry.pushPercent = StatMetrics.pushPercent(r.openPrice, r.highPrice)
    entry.lodPercent = StatMetrics.lodPercent(r.openPrice, r.lodPrice)
    entry.eodPercent = StatMetrics.eodPercent(r.openPrice, r.eodPrice)
    entry.source = StatSource.IMPORT
    entry.createdBy = null
  }

  private companion object {
    /** Newest-first, `createdAt` tiebreaker. Export order + implicit listing sort. */
    val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))

    /** ET market day — so "today" on a create matches the Nasdaq session the gap belongs to. */
    val MARKET_ZONE: ZoneId = ZoneId.of("America/New_York")
  }
}
