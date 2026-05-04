package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.analysis.domain.JobStatus
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface AnalysisJobRepository : JpaRepository<AnalysisJob, UUID> {
  fun findFirstByPortfolioIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
    portfolioId: UUID,
    status: JobStatus,
    after: Instant,
  ): AnalysisJob?

  /**
   * Bulk-flip every job currently in [oldStatus] to [newStatus] with the given [error] payload.
   * Counterpart to [TickerNarrativeJobRepository.bulkUpdateStatus] for the legacy Phase 0 jobs —
   * the table still gets written by the frozen `AnalysisExecutor` if it's ever rallumé, so the
   * orphan-cleanup listener covers both tables.
   */
  @Modifying
  @Query(
    "UPDATE AnalysisJob j SET j.status = :newStatus, j.error = :error WHERE j.status = :oldStatus"
  )
  fun bulkUpdateStatus(
    @Param("oldStatus") oldStatus: JobStatus,
    @Param("newStatus") newStatus: JobStatus,
    @Param("error") error: String?,
  ): Int
}
