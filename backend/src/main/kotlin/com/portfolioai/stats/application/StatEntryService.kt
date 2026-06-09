package com.portfolioai.stats.application

import com.portfolioai.stats.application.dto.ImportResult
import com.portfolioai.stats.application.dto.StatEntryDto
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.application.dto.toDto
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatMetrics
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Stats import / export service. The stats table is a **global, shared dataset** (no per-user
 * scoping) — so this service carries no user context. ADMIN-only access is enforced at the HTTP
 * layer (`hasRole("ADMIN")` on the stats POST routes in `SecurityConfig`), not here ; the export is
 * a plain `GET` readable by any authenticated user (the dataset is shared by design).
 *
 * [importCsv] computes the three percentage columns (via [StatMetrics]) at insert time from the
 * imported price levels — they are not part of the import CSV. [exportAllAsCsv] re-emits exactly
 * the import layout (those computed columns omitted), so an export re-imports as-is (cf.
 * [StatEntryCsvEncoder]).
 */
@Service
class StatEntryService(private val repo: StatEntryRepository) {

  /**
   * Imports a stats CSV (cf. `docs/data-input/stats-demo.csv`).
   *
   * **Atomic batch** — if [StatEntryCsvDecoder] surfaces any per-row error, **no** row is persisted
   * (`created = 0`, `errors` carries the line-level diagnostics). On a clean decode the whole batch
   * is saved in a single transaction and `created == parsed`.
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
   * Exports the **whole** stat table as a CSV string (cf. [StatEntryCsvEncoder]). Rows come out
   * newest-first (`tradeDate` desc, then `createdAt` desc as a stable tiebreaker for same-day
   * rows), matching the journal export ordering. Read-only ; no per-user filtering — the dataset is
   * global.
   */
  @Transactional(readOnly = true)
  fun exportAllAsCsv(): String {
    return StatEntryCsvEncoder.encode(repo.findAll(DEFAULT_SORT))
  }

  /**
   * Paginated listing for the read-only stats table. The dataset is global — no per-user scoping —
   * so the whole `stat_entry` table is the candidate set.
   *
   * **Sort resolution** — owned **here**, not by Spring's `@PageableDefault` resolver (same
   * rationale as `TradeEntryService.findAllPaged`). The controller passes through whatever Spring
   * built from the URL `sort` params (or empty if none) ; this service falls back to [DEFAULT_SORT]
   * (`tradeDate desc, createdAt desc`) only when the client sent no `sort`, so the table opens on
   * the freshest rows while a user-supplied sort is always honoured.
   */
  @Transactional(readOnly = true)
  fun findAllPaged(pageable: Pageable): Page<StatEntryDto> {
    val effective =
      if (pageable.sort.isUnsorted)
        PageRequest.of(pageable.pageNumber, pageable.pageSize, DEFAULT_SORT)
      else pageable
    return repo.findAll(effective).map { it.toDto() }
  }

  companion object {
    /**
     * Newest-first, with `createdAt` as a stable tiebreaker for same-day rows. Used both as the
     * export order and as the implicit listing sort when the client sends no `sort` URL param.
     */
    private val DEFAULT_SORT: Sort =
      Sort.by(Sort.Order.desc("tradeDate"), Sort.Order.desc("createdAt"))
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
    )
}
