package com.portfolioai.stats.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.stats.application.dto.ImportResult
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.application.dto.StatRadarCreateRequest
import com.portfolioai.stats.application.dto.toDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatMetrics
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.time.LocalDate
import java.time.ZoneId
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Stats import / export / create service.
 *
 * Since V2 the dataset is **admin-global + per-user** (not fully global) : the ADMIN CSV import
 * feeds the shared curated rows ([StatSource.IMPORT], `createdBy = null`), while any authenticated
 * user can seed a partial row from the radar ([createFromRadar], [StatSource.RADAR], owned by
 * them). Reads are scoped accordingly — a user sees the global rows + their own, never another
 * user's (cf. [StatEntryRepository.findVisible]).
 *
 * [importCsv] computes the three percentage columns (via [StatMetrics]) at insert time from the
 * imported price levels — they are not part of the import CSV. [exportAllAsCsv] re-emits exactly
 * the import layout (those computed columns omitted) over the **global** set only, so an export
 * re-imports as-is (radar partial rows never leave through the CSV).
 */
@Service
class StatEntryService(
  private val repo: StatEntryRepository,
  private val authService: AuthService,
) {

  /**
   * Imports a stats CSV (cf. `docs/data-input/stats-demo.csv`). ADMIN-gated at the HTTP layer.
   *
   * **Atomic batch** — if [StatEntryCsvDecoder] surfaces any per-row error, **no** row is persisted
   * (`created = 0`, `errors` carries the line-level diagnostics). On a clean decode the whole batch
   * is saved in a single transaction and `created == parsed`. Imported rows are [StatSource.IMPORT]
   * with `createdBy = null` — the global curated dataset.
   *
   * For each persisted row the derived `%push` / `%LOD` / `%EOD` columns are computed from `open /
   * high / lod / eod` and stored alongside the manual inputs.
   */
  @Transactional
  fun importCsv(csv: String): ImportResult {
    val decoded = StatEntryCsvDecoder.decode(csv)
    if (decoded.errors.isNotEmpty()) {
      return ImportResult(parsed = decoded.rows.size, created = 0, errors = decoded.errors)
    }
    for (request in decoded.rows) {
      repo.save(toEntity(request))
    }
    return ImportResult(
      parsed = decoded.rows.size,
      created = decoded.rows.size,
      errors = emptyList(),
    )
  }

  /**
   * Seeds a partial stat row from the radar « Add stat » button — open to any authenticated user.
   * Only the scan-time fields are known (ticker / gap / open price) ; the setup flags and the EOD
   * outcome (high / lod / eod + derived %) stay null until the day plays out. The row is owned by
   * the current user ([StatSource.RADAR]) and visible only to them alongside the global IMPORT
   * rows.
   *
   * [tradeDate] defaults to the current ET market day when the caller omits it (the morning you
   * spot the mover).
   */
  @Transactional
  fun createFromRadar(request: StatRadarCreateRequest): StatEntryDto {
    val userId = authService.getCurrentUser().id
    val entry =
      StatEntry(
        tradeDate = request.tradeDate ?: LocalDate.now(MARKET_ZONE),
        ticker = request.ticker.trim().uppercase(),
        gapUpPercent = request.gapUpPercent,
        openPrice = request.openPrice,
        source = StatSource.RADAR,
        createdBy = userId,
      )
    return repo.save(entry).toDto()
  }

  /**
   * Exports the **global/admin curated** stat rows as a CSV string (cf. [StatEntryCsvEncoder]).
   * Rows come out newest-first (`tradeDate` desc, then `createdAt` desc as a stable tiebreaker for
   * same-day rows), matching the journal export ordering. Scoped to `created_by IS NULL` so the
   * export stays roundtrip-safe : the curated rows are complete, while radar partial rows (which
   * carry NULL setup/outcome columns) never leave through the CSV.
   */
  @Transactional(readOnly = true)
  fun exportAllAsCsv(): String {
    return StatEntryCsvEncoder.encode(repo.findByCreatedByIsNull(DEFAULT_SORT))
  }

  /**
   * Paginated listing for the read-only stats table, scoped to what the current user may see : the
   * global/admin rows plus their own radar picks ([StatEntryRepository.findVisible]).
   *
   * **Sort resolution** — owned **here**, not by Spring's `@PageableDefault` resolver (same
   * rationale as `TradeEntryService.findAllPaged`). The controller passes through whatever Spring
   * built from the URL `sort` params (or empty if none) ; this service falls back to [DEFAULT_SORT]
   * (`tradeDate desc, createdAt desc`) only when the client sent no `sort`, so the table opens on
   * the freshest rows while a user-supplied sort is always honoured.
   */
  @Transactional(readOnly = true)
  fun findAllPaged(pageable: Pageable): Page<StatEntryDto> {
    val userId = authService.getCurrentUser().id
    val effective =
      if (pageable.sort.isUnsorted)
        PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
      else pageable
    return repo.findVisible(userId, effective).map { it.toDto() }
  }

  private companion object {
    /**
     * Newest-first, with `createdAt` as a stable tiebreaker for same-day rows. Used both as the
     * export order and as the implicit listing sort when the client sends no `sort` URL param.
     */
    val DEFAULT_SORT: Sort = Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))

    /** ET market day — so "today" on a radar pick matches the Nasdaq session the gap belongs to. */
    val MARKET_ZONE: ZoneId = ZoneId.of("America/New_York")
  }

  private fun toEntity(r: StatEntryRequest): StatEntry =
    StatEntry(
      tradeDate = r.tradeDate,
      ticker = r.ticker,
      gapUpPercent = r.gapUpPercent,
      floatSharesMillions = r.floatSharesMillions,
      institutionsPercent = r.institutionsPercent,
      instOver20 = r.instOver20,
      under1Dollar = r.under1Dollar,
      ssr = r.ssr,
      entryAfter11am = r.entryAfter11am,
      note = r.note,
      openPrice = r.openPrice,
      highPrice = r.highPrice,
      lodPrice = r.lodPrice,
      eodPrice = r.eodPrice,
      // Derived at insert — value ×100, 2 decimals (StatMetrics).
      pushPercent = StatMetrics.pushPercent(r.openPrice, r.highPrice),
      lodPercent = StatMetrics.lodPercent(r.openPrice, r.lodPrice),
      eodPercent = StatMetrics.eodPercent(r.openPrice, r.eodPrice),
      // CSV import = the curated global dataset.
      source = StatSource.IMPORT,
      createdBy = null,
    )
}
