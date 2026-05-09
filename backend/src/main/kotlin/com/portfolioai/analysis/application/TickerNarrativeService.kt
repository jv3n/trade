package com.portfolioai.analysis.application

import com.portfolioai.analysis.application.TickerNarrativeService.Companion.SNAPSHOT_FRESHNESS_WINDOW
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeSnapshotRepository
import java.time.Duration
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Entry point for the narrative pipeline. Handles dedup and snapshot reuse so the executor only
 * runs when the LLM actually has work to do.
 *
 * Decision tree on `startAsync(symbol)` :
 * 1. If a `PENDING` job exists for the symbol within the dedup window → return that one. Re-clicks
 *    don't fire parallel LLM calls.
 * 2. Else, if a snapshot exists for the symbol within the [SNAPSHOT_FRESHNESS_WINDOW] → create a
 *    `DONE` job pointing at it. The frontend gets a uniform "poll a job" experience whether the
 *    response is cached or freshly generated.
 * 3. Else → create a `PENDING` job and fire the async runner.
 */
@Service
class TickerNarrativeService(
  private val jobStore: TickerNarrativeJobStore,
  private val snapshotRepo: TickerNarrativeSnapshotRepository,
  private val runner: TickerNarrativeRunner,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun startAsync(symbol: String): TickerNarrativeJob {
    val normalized = symbol.uppercase()

    jobStore.pendingFor(normalized)?.let {
      log.info("Reusing pending narrative job {} for symbol={}", it.id, normalized)
      return it
    }

    val freshSnapshot = freshSnapshotFor(normalized)
    if (freshSnapshot != null) {
      log.info(
        "Reusing fresh snapshot {} for symbol={} (age={}s)",
        freshSnapshot.id,
        normalized,
        Duration.between(freshSnapshot.generatedAt, Instant.now()).seconds,
      )
      val job = jobStore.create(normalized)
      jobStore.complete(job.id, freshSnapshot.id)
      // Re-read so the caller sees the DONE status.
      return jobStore.get(job.id)!!
    }

    val job = jobStore.create(normalized)
    runner.run(normalized, job.id)
    return job
  }

  fun latestSnapshot(symbol: String): TickerNarrativeSnapshot? =
    snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc(symbol.uppercase())

  /**
   * Returns the most recent `PENDING` job for [symbol] within the dedup window, or `null` if none.
   * Lets the dossier reattach to a running SSE stream after a navigate-away → return-to-page round
   * trip — the `@Async` runner survives the client disconnect, but the in-page loading state
   * doesn't, and we need a way to re-pick it up. Uses the same uppercased lookup as [startAsync] so
   * both code paths agree on the dedup key.
   */
  fun pendingFor(symbol: String): TickerNarrativeJob? = jobStore.pendingFor(symbol.uppercase())

  private fun freshSnapshotFor(symbol: String): TickerNarrativeSnapshot? {
    val latest = snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc(symbol) ?: return null
    val age = Duration.between(latest.generatedAt, Instant.now())
    return if (age <= SNAPSHOT_FRESHNESS_WINDOW) latest else null
  }

  companion object {
    /** Re-prompt the LLM only if the most recent snapshot is older than this. */
    private val SNAPSHOT_FRESHNESS_WINDOW: Duration = Duration.ofMinutes(30)
  }
}
