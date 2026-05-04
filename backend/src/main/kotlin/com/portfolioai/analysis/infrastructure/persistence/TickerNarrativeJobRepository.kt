package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.TickerNarrativeJob
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface TickerNarrativeJobRepository : JpaRepository<TickerNarrativeJob, UUID> {
  /**
   * Most recent PENDING job for [symbol] created after [after]. Used to dedup re-fired generation
   * requests on the same ticker while the LLM is still chewing.
   */
  fun findFirstBySymbolAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
    symbol: String,
    status: JobStatus,
    after: Instant,
  ): TickerNarrativeJob?

  /**
   * Bulk-flip every job currently in [oldStatus] to [newStatus] with the given [error] payload.
   * Used by the boot-time orphan cleanup so a hot-reload mid-LLM-call doesn't leave a `PENDING` row
   * stuck forever — see [com.portfolioai.analysis.infrastructure.OrphanedJobCleanupListener].
   * Returns the number of rows updated (zero on a clean boot).
   */
  @Modifying
  @Query(
    "UPDATE TickerNarrativeJob j SET j.status = :newStatus, j.error = :error WHERE j.status = :oldStatus"
  )
  fun bulkUpdateStatus(
    @Param("oldStatus") oldStatus: JobStatus,
    @Param("newStatus") newStatus: JobStatus,
    @Param("error") error: String?,
  ): Int
}
