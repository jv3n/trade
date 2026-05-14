package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobEvent
import com.portfolioai.analysis.domain.JobPhase
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * In-memory pub/sub for [JobEvent]s, indexed by jobId. Backs the SSE endpoint `GET
 * /narrative/jobs/{id}/stream` so the frontend gets per-phase updates as the runner progresses,
 * instead of polling [TickerNarrativeJobStore] every 3 s for a binary status.
 *
 * Replay-on-reconnect : every event published for a job is retained in a per-jobId bucket. A client
 * that connects mid-flight (or even after the job has reached a terminal phase) replays the full
 * history before the live tail starts. Buckets are pruned [TERMINAL_RETENTION] after the job
 * reaches [JobPhase.DONE] / [JobPhase.ERROR] — this matches what a typical user can do (open
 * dossier → pause → reload, all within ~60 s) without leaking memory.
 *
 * Thread-safety : the buckets live in a [ConcurrentHashMap], events and emitters live in
 * [CopyOnWriteArrayList] (write-through, low write rate, many concurrent reads on send). The runner
 * publishes from a `@Async` thread and the controller registers from a request thread — those two
 * never block each other.
 *
 * Single-process by design (memory state). When Phase 5 multi-instance deploy lands, swap to a
 * Redis pub/sub or to the unified `job` DAG table (Phase 4) ; the contract on this class stays the
 * same.
 */
@Component
open class JobEventPublisher(private val clock: Clock = Clock.systemUTC()) {

  private val log = LoggerFactory.getLogger(javaClass)

  private val buckets = ConcurrentHashMap<UUID, JobBucket>()

  /**
   * Records [phase] for [jobId] and broadcasts to every registered [SseEmitter]. Returns the built
   * [JobEvent] so callers can log or assert on it. Safe to call before any client has connected —
   * the event is retained and replayed on the first [register] call.
   */
  fun publish(
    jobId: UUID,
    phase: JobPhase,
    attempt: Int = 1,
    error: String? = null,
    payload: String? = null,
  ): JobEvent {
    pruneStale()
    val bucket = buckets.computeIfAbsent(jobId) { JobBucket(startedAt = clock.instant()) }
    val event =
      JobEvent(
        phase = phase,
        attempt = attempt,
        elapsedMs = Duration.between(bucket.startedAt, clock.instant()).toMillis(),
        error = error,
        payload = payload,
      )
    bucket.events.add(event)
    if (phase.terminal) bucket.terminalAt = clock.instant()

    broadcast(jobId, bucket, event)
    return event
  }

  /**
   * Opens a fresh [SseEmitter] for [jobId] and replays any events already published. If the job has
   * already reached a terminal phase, the emitter is completed in the same call — the client
   * receives the full history then `EventSource.onmessage` stops firing. Returns a never-null
   * emitter even for unknown jobIds (idle until pruned), which keeps the controller mapping trivial
   * — the frontend already has the jobId from the `POST /narrative` response, so a synthetic 404
   * here would be redundant noise.
   */
  fun register(jobId: UUID): SseEmitter {
    pruneStale()
    val emitter = createEmitter()
    val bucket = buckets.computeIfAbsent(jobId) { JobBucket(startedAt = clock.instant()) }

    // Replay first. If a replayed send fails (client already gone, race on connect), bail out —
    // the emitter is already broken and there's nothing to broadcast on it later.
    val terminal = bucket.terminalAt != null
    for (event in bucket.events) {
      try {
        emitter.send(SseEmitter.event().name(SSE_EVENT_NAME).data(event))
      } catch (e: Exception) {
        log.debug("Replay to emitter for job {} failed: {}", jobId, e.message)
        return emitter
      }
    }

    if (terminal) {
      emitter.complete()
    } else {
      bucket.emitters.add(emitter)
      emitter.onCompletion { bucket.emitters.remove(emitter) }
      emitter.onTimeout { bucket.emitters.remove(emitter) }
      emitter.onError { _ -> bucket.emitters.remove(emitter) }
    }
    return emitter
  }

  /**
   * Test-only window into the publisher state. Returns the snapshot of recorded events for [jobId]
   * (empty list if unknown). Don't use this from production code — go through SSE, the bucket is an
   * implementation detail.
   */
  fun eventsFor(jobId: UUID): List<JobEvent> = buckets[jobId]?.events?.toList() ?: emptyList()

  /**
   * Test seam : tests subclass [JobEventPublisher] and override this to swap in a recording
   * [SseEmitter] subclass that captures `send()` / `complete()` calls. Production callers should
   * never need to override.
   */
  internal open fun createEmitter(): SseEmitter = SseEmitter(EMITTER_TIMEOUT_MS)

  private fun broadcast(jobId: UUID, bucket: JobBucket, event: JobEvent) {
    val dead = mutableListOf<SseEmitter>()
    for (emitter in bucket.emitters) {
      try {
        emitter.send(SseEmitter.event().name(SSE_EVENT_NAME).data(event))
        if (event.phase.terminal) emitter.complete()
      } catch (e: Exception) {
        log.debug("Send to emitter for job {} failed, removing: {}", jobId, e.message)
        dead.add(emitter)
      }
    }
    bucket.emitters.removeAll(dead)
  }

  private fun pruneStale() {
    val cutoff = clock.instant().minus(TERMINAL_RETENTION)
    val iterator = buckets.entries.iterator()
    while (iterator.hasNext()) {
      val terminalAt = iterator.next().value.terminalAt
      if (terminalAt != null && terminalAt.isBefore(cutoff)) iterator.remove()
    }
  }

  private class JobBucket(
    val startedAt: Instant,
    val events: CopyOnWriteArrayList<JobEvent> = CopyOnWriteArrayList(),
    val emitters: CopyOnWriteArrayList<SseEmitter> = CopyOnWriteArrayList(),
    @Volatile var terminalAt: Instant? = null,
  )

  companion object {
    /**
     * How long after a terminal phase we keep the bucket alive so a late reconnect still gets the
     * full history. 60 s covers the realistic "user reload after seeing DONE" gap ; longer would
     * just leak memory single-user.
     */
    private val TERMINAL_RETENTION: Duration = Duration.ofSeconds(60)

    /**
     * Default [SseEmitter] timeout (15 min). Generous enough to outlive even a slow Ollama-on-Mac
     * narrative (`llm.timeout-seconds` defaults to 400 s, max 900 s) ; orphan emitters from
     * forgotten tabs auto-collect via this ceiling.
     */
    private const val EMITTER_TIMEOUT_MS: Long = 15L * 60 * 1000

    /**
     * SSE event name the frontend's `EventSource.addEventListener('phase', …)` will subscribe to. A
     * named event lets us add a second channel later (e.g. `'token'` for streaming partial
     * narrative output, Phase 3+) without breaking existing clients.
     */
    const val SSE_EVENT_NAME: String = "phase"
  }
}
