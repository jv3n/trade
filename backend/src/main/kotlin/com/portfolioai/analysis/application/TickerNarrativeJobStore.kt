package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeJobRepository
import java.time.Instant
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Mirror of [AnalysisJobStore] for narrative jobs : create / get / dedup pending / mark complete /
 * mark failed.
 */
@Component
class TickerNarrativeJobStore(private val repo: TickerNarrativeJobRepository) {

  @Transactional
  fun create(symbol: String): TickerNarrativeJob = repo.save(TickerNarrativeJob(symbol = symbol))

  @Transactional(readOnly = true) fun get(id: UUID): TickerNarrativeJob? = repo.findByIdOrNull(id)

  /**
   * Dedup window — a re-clicked "generate" on the same symbol returns the existing pending job
   * instead of creating a parallel one. 5 min is well above Claude (1-3s) and covers Ollama's worst
   * case (~60s).
   */
  @Transactional(readOnly = true)
  fun pendingFor(symbol: String): TickerNarrativeJob? =
    repo.findFirstBySymbolAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
      symbol,
      JobStatus.PENDING,
      Instant.now().minusSeconds(DEDUP_WINDOW_SECONDS),
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

  companion object {
    private const val DEDUP_WINDOW_SECONDS = 300L
  }
}
