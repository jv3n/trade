package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobPhase
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component

/**
 * Async wrapper around [TickerNarrativeExecutor]. Lives on a separate `@Component` so Spring's
 * `@Async` proxy actually fires (a `this.method()` call from inside the same bean would bypass AOP,
 * see CLAUDE.md).
 *
 * Owns the terminal [JobPhase.DONE] / [JobPhase.ERROR] events on the job's SSE stream — the
 * executor publishes the per-step phases (`LOADING_CONTEXT`, `CALLING_LLM`, …, `PERSISTING`) before
 * either returning a snapshot (success) or throwing (final failure after retries).
 */
@Component
class TickerNarrativeRunner(
  private val executor: TickerNarrativeExecutor,
  private val jobStore: TickerNarrativeJobStore,
  private val publisher: JobEventPublisher,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Async
  fun run(symbol: String, jobId: UUID) {
    try {
      val snapshot = executor.execute(symbol, jobId)
      jobStore.complete(jobId, snapshot.id)
      publisher.publish(jobId, JobPhase.DONE)
    } catch (e: Exception) {
      log.error("Narrative job {} for symbol={} failed: {}", jobId, symbol, e.message)
      val message = e.message ?: "Unknown error"
      jobStore.fail(jobId, message)
      publisher.publish(jobId, JobPhase.ERROR, error = message)
    }
  }
}
