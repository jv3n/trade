package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.infrastructure.persistence.AnalysisJobRepository
import java.time.Instant
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AnalysisJobStore(private val repo: AnalysisJobRepository) {

  @Transactional
  fun create(portfolioId: UUID): AnalysisJob = repo.save(AnalysisJob(portfolioId = portfolioId))

  @Transactional(readOnly = true) fun get(id: UUID): AnalysisJob? = repo.findByIdOrNull(id)

  @Transactional(readOnly = true)
  fun pendingFor(portfolioId: UUID): AnalysisJob? =
    repo.findFirstByPortfolioIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
      portfolioId,
      JobStatus.PENDING,
      Instant.now().minusSeconds(90),
    )

  @Transactional
  fun complete(id: UUID, recommendationId: UUID) {
    repo.findByIdOrNull(id)?.let {
      it.status = JobStatus.DONE
      it.recommendationId = recommendationId
      repo.save(it)
    }
  }

  @Transactional
  fun fail(id: UUID, error: String) {
    repo.findByIdOrNull(id)?.let {
      it.status = JobStatus.ERROR
      it.error = error
      repo.save(it)
    }
  }
}
