package com.portfolioai.analysis.infrastructure

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.infrastructure.OrphanedJobCleanupListener.Companion.ORPHAN_MESSAGE
import com.portfolioai.analysis.infrastructure.persistence.AnalysisJobRepository
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeJobRepository
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Boot-time cleanup of orphaned async jobs. A `PENDING` job is the byproduct of "request received,
 * runner kicked, response in-flight" — if the backend hot-reloads (Tilt save) or crashes between
 * "kick" and "complete", the row stays `PENDING` forever and the front polls it indefinitely until
 * the abort timeout fires.
 *
 * On every successful boot we flip every `PENDING` row to `ERROR` with a marker message
 * ([ORPHAN_MESSAGE]) so the front can surface a meaningful failure on next poll rather than spin.
 * Covers both job tables :
 * - `ticker_narrative_job` — Phase 1, the user-facing one (clicked Generate, hot-reloaded mid-LLM).
 * - `analysis_job` — Phase 0 legacy. Frozen but the table still exists ; we sweep it too in case
 *   someone reactivates the legacy pipeline and we want a clean state.
 *
 * Why `ApplicationReadyEvent` and not `@PostConstruct` on a service : the event fires after the
 * full context (incl. JPA / DataSource / Flyway migrations) is up. `@PostConstruct` on the listener
 * bean would race with Flyway in some startup orders. Bulk JPQL UPDATE rather than load-and-save :
 * a single SQL round-trip, no entity hydration, no first-level cache pollution.
 */
@Component
class OrphanedJobCleanupListener(
  private val narrativeJobRepository: TickerNarrativeJobRepository,
  private val analysisJobRepository: AnalysisJobRepository,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @EventListener(ApplicationReadyEvent::class)
  @Transactional
  fun cleanupOrphanedJobs() {
    val narrativeFlipped =
      narrativeJobRepository.bulkUpdateStatus(JobStatus.PENDING, JobStatus.ERROR, ORPHAN_MESSAGE)
    val analysisFlipped =
      analysisJobRepository.bulkUpdateStatus(JobStatus.PENDING, JobStatus.ERROR, ORPHAN_MESSAGE)
    if (narrativeFlipped > 0 || analysisFlipped > 0) {
      log.info(
        "Orphaned-job cleanup at boot : narrative={} analysis={}",
        narrativeFlipped,
        analysisFlipped,
      )
    }
  }

  companion object {
    /**
     * Marker stored on every flipped job. Distinguishes a real LLM/parser/validator failure (which
     * carries a contextual message from the executor) from a "the backend went away mid-call"
     * scenario, which is invisible at the time it happens but recoverable at next boot.
     */
    const val ORPHAN_MESSAGE =
      "Job orphaned at backend boot — the previous instance crashed or hot-reloaded mid-execution."
  }
}
