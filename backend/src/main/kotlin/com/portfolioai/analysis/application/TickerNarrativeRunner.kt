package com.portfolioai.analysis.application

import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Component

/**
 * Async wrapper around [TickerNarrativeExecutor]. Lives on a separate `@Component` so Spring's
 * `@Async` proxy actually fires (a `this.method()` call from inside the same bean would bypass AOP,
 * see CLAUDE.md).
 */
@Component
class TickerNarrativeRunner(
  private val executor: TickerNarrativeExecutor,
  private val jobStore: TickerNarrativeJobStore,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Async
  fun run(symbol: String, jobId: UUID) {
    try {
      val snapshot = executor.execute(symbol)
      jobStore.complete(jobId, snapshot.id)
    } catch (e: Exception) {
      log.error("Narrative job {} for symbol={} failed: {}", jobId, symbol, e.message)
      jobStore.fail(jobId, e.message ?: "Unknown error")
    }
  }
}
