package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor

/**
 * Dataset is **admin-global + per-user** since V2 :
 * - ADMIN CSV imports land as `created_by = null` (the shared community rows everyone reads).
 * - A user's radar / manual analyses land as `created_by = <them>` (visible only to that user).
 *
 * The listing goes through [JpaSpecificationExecutor] + [StatEntrySpecifications] (visibility +
 * filters). [findByCreatedByIsNull] scopes the CSV export to the curated global set
 * (roundtrip-safe). The three [findByTradeDateAndTickerAndCreatedBy] / [findByIdAndCreatedBy] /
 * [deleteByIdAndCreatedBy] back the upsert + ownership-scoped edit / delete (a row the caller
 * doesn't own — incl. every IMPORT row, `created_by = null` — never matches, so it can't be
 * touched).
 */
interface StatEntryRepository :
  JpaRepository<StatEntry, UUID>, JpaSpecificationExecutor<StatEntry> {

  /** Admin/global curated rows only — the CSV export set (complete, roundtrip-safe). */
  fun findByCreatedByIsNull(sort: Sort): List<StatEntry>

  /** Upsert lookup — the caller's existing analysis for a (day, ticker), if any. */
  fun findByTradeDateAndTickerAndCreatedBy(
    tradeDate: LocalDate,
    ticker: String,
    createdBy: UUID,
  ): StatEntry?

  /**
   * Upsert lookup for the CSV import — the global/community analysis for a (day, ticker), if any.
   */
  fun findByTradeDateAndTickerAndCreatedByIsNull(tradeDate: LocalDate, ticker: String): StatEntry?

  /** Ownership-scoped fetch for edit — null when the row isn't the caller's (incl. IMPORT rows). */
  fun findByIdAndCreatedBy(id: UUID, createdBy: UUID): StatEntry?

  /**
   * Ownership-scoped delete — returns the number of rows removed (0 when not owned by the caller).
   */
  fun deleteByIdAndCreatedBy(id: UUID, createdBy: UUID): Long
}
