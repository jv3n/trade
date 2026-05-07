package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeJobRepository
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import java.time.Instant
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Lifecycle store for narrative jobs : create / get / dedup pending / mark complete / mark failed.
 * Reads the dedup window from runtime config so a slider drag in `/settings/configuration > LLM`
 * shifts both the frontend poll abort and the backend dedup at once.
 */
@Component
class TickerNarrativeJobStore(
  private val repo: TickerNarrativeJobRepository,
  private val appConfig: AppConfigService,
) {

  @Transactional
  fun create(symbol: String): TickerNarrativeJob = repo.save(TickerNarrativeJob(symbol = symbol))

  @Transactional(readOnly = true) fun get(id: UUID): TickerNarrativeJob? = repo.findByIdOrNull(id)

  /**
   * Dedup window — a re-clicked "generate" on the same symbol returns the existing pending job
   * instead of creating a parallel one. Reads the runtime [ConfigKeys.LLM_TIMEOUT_SECONDS] so the
   * narrative dedup window scales with the slider just like the portfolio analysis dedup window
   * (kept symmetric on purpose : changing the timeout once propagates everywhere).
   */
  @Transactional(readOnly = true)
  fun pendingFor(symbol: String): TickerNarrativeJob? =
    repo.findFirstBySymbolAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
      symbol,
      JobStatus.PENDING,
      Instant.now().minusSeconds(appConfig.getInt(ConfigKeys.LLM_TIMEOUT_SECONDS).toLong()),
    )

  @Transactional
  fun complete(id: UUID, snapshotId: UUID) {
    repo.findByIdOrNull(id)?.let {
      it.status = JobStatus.DONE
      it.snapshotId = snapshotId
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
