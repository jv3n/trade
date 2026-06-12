package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import java.util.UUID
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

/**
 * Since V2 the dataset is **admin-global + per-user**, not fully global :
 * - ADMIN CSV imports land as `created_by = null` (the shared, curated rows everyone reads).
 * - A user's radar « Add stat » picks land as `created_by = <them>` (visible only to that user).
 *
 * [findVisible] enforces that split on the read path ; [findByCreatedByIsNull] scopes the CSV
 * export to the curated global set, keeping the export roundtrip-safe (radar partial rows never
 * leave through the CSV).
 */
interface StatEntryRepository : JpaRepository<StatEntry, UUID> {

  /**
   * Rows a user is allowed to see : the global/admin curated set (`created_by IS NULL`) plus their
   * own radar picks. Paginated for the listing table.
   */
  @Query("SELECT s FROM StatEntry s WHERE s.createdBy IS NULL OR s.createdBy = :userId")
  fun findVisible(@Param("userId") userId: UUID, pageable: Pageable): Page<StatEntry>

  /** Admin/global curated rows only — the CSV export set (complete, roundtrip-safe). */
  fun findByCreatedByIsNull(sort: Sort): List<StatEntry>
}
