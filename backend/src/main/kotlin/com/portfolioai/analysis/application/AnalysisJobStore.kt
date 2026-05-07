package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.infrastructure.persistence.AnalysisJobRepository
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import java.time.Instant
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AnalysisJobStore(
  private val repo: AnalysisJobRepository,
  private val appConfig: AppConfigService,
) {

  @Transactional
  fun create(portfolioId: UUID): AnalysisJob = repo.save(AnalysisJob(portfolioId = portfolioId))

  @Transactional(readOnly = true) fun get(id: UUID): AnalysisJob? = repo.findByIdOrNull(id)

  /**
   * Window during which a re-clicked analysis on the same portfolio is deduped onto the existing
   * pending job. Reads the runtime [ConfigKeys.LLM_TIMEOUT_SECONDS] so it stays aligned with the
   * frontend `POLL_ABORT_SECONDS` and the backend `OllamaClient` read timeout — moving the slider
   * in `/settings/configuration` shifts all three at once.
   */
  @Transactional(readOnly = true)
  fun pendingFor(portfolioId: UUID): AnalysisJob? =
    repo.findFirstByPortfolioIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
      portfolioId,
      JobStatus.PENDING,
      Instant.now().minusSeconds(appConfig.getInt(ConfigKeys.LLM_TIMEOUT_SECONDS).toLong()),
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
