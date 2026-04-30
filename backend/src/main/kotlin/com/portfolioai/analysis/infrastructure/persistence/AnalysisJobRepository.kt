package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.analysis.domain.JobStatus
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface AnalysisJobRepository : JpaRepository<AnalysisJob, UUID> {
  fun findFirstByPortfolioIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
    portfolioId: UUID,
    status: JobStatus,
    after: Instant,
  ): AnalysisJob?
}
