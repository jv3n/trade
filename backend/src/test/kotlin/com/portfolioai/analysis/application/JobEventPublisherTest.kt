package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobPhase
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * Tests on [JobEventPublisher] — pin the in-memory pub/sub semantics that back the SSE narrative
 * stream. The publisher is the bridge between the `@Async` runner ([TickerNarrativeRunner]) and the
 * controller's [SseEmitter] : it must be honest about ordering, replay-on-reconnect, terminal
 * lifecycle, and broken-emitter cleanup, otherwise the dossier ticker UI either blocks (no events
 * arrive) or shows a stale phase.
 *
 * What we pin :
 * - **Recording semantics** — every [JobEventPublisher.publish] call appends a [JobEvent] under the
 *   right jobId, in order, with `attempt` and `elapsedMs` populated.
 * - **Replay-on-reconnect** — a client that calls [JobEventPublisher.register] _after_ events have
 *   already been published receives the full history before any live tail. Critical because the
 *   frontend kicks the runner via `POST /narrative` and only opens the SSE moments later — the
 *   first 2-3 events (`LOADING_CONTEXT`, `CALLING_LLM`) typically already fired.
 * - **Live tail** — events published _after_ a register() reach the registered emitter.
 * - **Terminal completion** — [JobPhase.DONE] / [JobPhase.ERROR] both flip the bucket terminal
 *   state and call `complete()` on every active emitter so the browser's `EventSource` stops
 *   reconnecting in a tight loop.
 * - **Late connect on terminal job** — registering after a job already finished still replays the
 *   full history then completes immediately (covers the "user reloads dossier 30 s after the
 *   narrative landed" case).
 * - **Broken emitter cleanup** — an [SseEmitter] that throws on `send()` (client disconnected, OOM
 *   on a giant write) is removed from the active list so it doesn't keep failing on every
 *   subsequent broadcast.
 * - **Multi-emitter fan-out** — two clients on the same job both receive every event (relevant for
 *   the future page Jobs DAG view that may open a separate stream per node).
 * - **TTL eviction** — once a job has been terminal for longer than [TERMINAL_RETENTION] (60 s),
 *   the next [JobEventPublisher.pruneStale] call (triggered by any subsequent publish or register)
 *   drops the bucket. A late client that reconnects after eviction gets a fresh idle emitter rather
 *   than the replay of a vanished history. Test uses an injectable [Clock] to avoid sleeping 60 s.
 */
class JobEventPublisherTest {

  @Test
  fun `publish records the event under the job id`() {
    val publisher = JobEventPublisher()
    val jobId = UUID.randomUUID()

    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)

    val events = publisher.eventsFor(jobId)
    assertEquals(1, events.size)
    assertEquals(JobPhase.LOADING_CONTEXT, events[0].phase)
    assertEquals(1, events[0].attempt)
    assertNull(events[0].error)
  }

  @Test
  fun `publish accumulates events in order across phases`() {
    val publisher = JobEventPublisher()
    val jobId = UUID.randomUUID()

    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.CALLING_LLM, attempt = 1)
    publisher.publish(jobId, JobPhase.RECEIVED_RAW, attempt = 1)
    publisher.publish(jobId, JobPhase.PARSING, attempt = 1)
    publisher.publish(jobId, JobPhase.VALIDATING, attempt = 1)
    publisher.publish(jobId, JobPhase.PERSISTING, attempt = 1)
    publisher.publish(jobId, JobPhase.DONE)

    val phases = publisher.eventsFor(jobId).map { it.phase }
    assertEquals(
      listOf(
        JobPhase.LOADING_CONTEXT,
        JobPhase.CALLING_LLM,
        JobPhase.RECEIVED_RAW,
        JobPhase.PARSING,
        JobPhase.VALIDATING,
        JobPhase.PERSISTING,
        JobPhase.DONE,
      ),
      phases,
    )
  }

  @Test
  fun `publish stamps a non-decreasing elapsedMs anchored to the first event`() {
    val publisher = JobEventPublisher()
    val jobId = UUID.randomUUID()

    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    Thread.sleep(SLEEP_MS_FOR_ELAPSED_GAP)
    publisher.publish(jobId, JobPhase.CALLING_LLM)

    val events = publisher.eventsFor(jobId)
    assertTrue(events[0].elapsedMs <= events[1].elapsedMs)
    // Realistic gap : ~5 ms after a Thread.sleep(5). Allow some jitter on busy CI but reject 0.
    assertTrue(
      events[1].elapsedMs >= 1,
      "Second event should record measurable elapsed > 0 (was ${events[1].elapsedMs})",
    )
  }

  @Test
  fun `publish ERROR carries the error message on the event`() {
    val publisher = JobEventPublisher()
    val jobId = UUID.randomUUID()

    publisher.publish(jobId, JobPhase.ERROR, error = "LLM timeout after 400s")

    val event = publisher.eventsFor(jobId).single()
    assertEquals(JobPhase.ERROR, event.phase)
    assertEquals("LLM timeout after 400s", event.error)
  }

  @Test
  fun `register returns an emitter that receives subsequent live events`() {
    val publisher = TestablePublisher()
    val jobId = UUID.randomUUID()

    publisher.register(jobId)
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.CALLING_LLM)

    val emitter = publisher.recorded.single()
    assertEquals(2, emitter.sendCount.get())
    assertFalse(emitter.completed)
  }

  @Test
  fun `register replays existing events to a late-connecting emitter`() {
    val publisher = TestablePublisher()
    val jobId = UUID.randomUUID()

    // Runner fires three phases before the frontend opens its EventSource.
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.CALLING_LLM)
    publisher.publish(jobId, JobPhase.RECEIVED_RAW)

    publisher.register(jobId)

    val emitter = publisher.recorded.single()
    // 3 events replayed on register, none live yet.
    assertEquals(3, emitter.sendCount.get())
    assertFalse(emitter.completed)
  }

  @Test
  fun `register on an already-terminal job replays history then completes the emitter`() {
    val publisher = TestablePublisher()
    val jobId = UUID.randomUUID()

    // Job finished entirely before the client connected — typical of a fast Claude run that
    // beats the frontend's POST→EventSource gap.
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.CALLING_LLM)
    publisher.publish(jobId, JobPhase.DONE)

    publisher.register(jobId)

    val emitter = publisher.recorded.single()
    assertEquals(3, emitter.sendCount.get())
    assertTrue(emitter.completed, "Late connect on terminal job must complete the emitter")
  }

  @Test
  fun `terminal phase completes every active emitter`() {
    val publisher = TestablePublisher()
    val jobId = UUID.randomUUID()

    publisher.register(jobId)
    publisher.register(jobId)
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.DONE)

    assertEquals(2, publisher.recorded.size)
    publisher.recorded.forEach {
      assertEquals(2, it.sendCount.get())
      assertTrue(it.completed)
    }
  }

  @Test
  fun `multiple emitters on the same job all receive every event`() {
    val publisher = TestablePublisher()
    val jobId = UUID.randomUUID()

    val emitterA = publisher.register(jobId) as RecordingEmitter
    val emitterB = publisher.register(jobId) as RecordingEmitter
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.CALLING_LLM)

    assertEquals(2, emitterA.sendCount.get())
    assertEquals(2, emitterB.sendCount.get())
  }

  @Test
  fun `emitter that throws on send is removed from the active list so subsequent events skip it`() {
    val publisher = ThrowingFirstEmitterPublisher()
    val jobId = UUID.randomUUID()

    publisher.register(jobId) // throws on first send → removed
    publisher.register(jobId) // healthy → keeps receiving
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.CALLING_LLM)

    val (broken, healthy) = publisher.recorded[0] to publisher.recorded[1]
    // The broken one was attempted on the first publish (1 send attempt) but the second publish
    // should never reach it because it was pruned.
    assertEquals(1, broken.sendAttempts.get(), "Broken emitter should not be re-attempted")
    assertEquals(2, healthy.sendCount.get(), "Healthy emitter receives every event")
  }

  @Test
  fun `eventsFor returns empty for an unknown job id`() {
    val publisher = JobEventPublisher()
    assertEquals(emptyList<Any>(), publisher.eventsFor(UUID.randomUUID()))
  }

  @Test
  fun `register on an unknown job id returns a non-null idle emitter`() {
    val publisher = JobEventPublisher()
    val emitter = publisher.register(UUID.randomUUID())
    // The frontend already has the jobId from POST /narrative ; a synthetic 404 here would be
    // redundant. The emitter sits idle until either an event arrives or its 15 min ceiling
    // closes it down.
    assertNotNull(emitter)
  }

  @Test
  fun `pruneStale evicts terminal buckets past retention so a late register replays nothing`() {
    // We need to advance time past TERMINAL_RETENTION (60 s) without sleeping the suite. The
    // injected MutableClock lets us teleport the publisher's wall-clock past the cutoff in a
    // single line. Without this seam the test would either be flaky (real sleep) or impossible.
    val t0 = Instant.parse("2026-05-14T12:00:00Z")
    val clock = MutableClock(t0)
    val publisher = ClockedTestablePublisher(clock)
    val jobId = UUID.randomUUID()

    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    publisher.publish(jobId, JobPhase.DONE)

    // Past the 60 s ceiling. Any subsequent publish or register triggers pruneStale, which
    // drops the bucket because terminalAt is now before the cutoff.
    clock.advance(Duration.ofSeconds(61))
    publisher.register(
      UUID.randomUUID()
    ) // unrelated jobId — its only role is to trigger pruneStale

    // Re-register on the original (now-evicted) jobId : a fresh bucket is materialised, so the
    // emitter starts idle. This pins the contract for the "user reloads the dossier ~5 min
    // after DONE" case — they get a clean stream that simply never emits, not a stale replay.
    val lateEmitter = publisher.register(jobId)
    val recordingEmitter = publisher.recorded.last { it === lateEmitter }
    assertEquals(0, recordingEmitter.sendCount.get(), "Pruned bucket : no replay on late register")
    assertFalse(
      recordingEmitter.completed,
      "Pruned bucket : emitter sits idle, not auto-completed from a stale terminalAt",
    )
  }

  private class TestablePublisher : JobEventPublisher() {
    val recorded = mutableListOf<RecordingEmitter>()

    override fun createEmitter(): SseEmitter = RecordingEmitter().also { recorded.add(it) }
  }

  /**
   * Subclass that throws on the very first `send` from the very first emitter built — used to
   * simulate a client that disconnects mid-flight (broken pipe, browser tab closed). Subsequent
   * emitters behave normally so we can assert the publisher pruned only the broken one.
   */
  /**
   * Like [TestablePublisher] but threads a [Clock] through so the eviction test can teleport time
   * past [JobEventPublisher.TERMINAL_RETENTION] without sleeping the suite.
   */
  private class ClockedTestablePublisher(clock: Clock) : JobEventPublisher(clock) {
    val recorded = mutableListOf<RecordingEmitter>()

    override fun createEmitter(): SseEmitter = RecordingEmitter().also { recorded.add(it) }
  }

  /**
   * Trivial [Clock] whose `instant()` returns whatever [advance] last set. UTC zone hardcoded — the
   * publisher only cares about ordering, not zone. Lives here rather than in a shared util because
   * nothing else needs it (yet).
   */
  private class MutableClock(private var current: Instant) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId?): Clock = this

    override fun instant(): Instant = current

    fun advance(duration: Duration) {
      current = current.plus(duration)
    }
  }

  private class ThrowingFirstEmitterPublisher : JobEventPublisher() {
    val recorded = mutableListOf<RecordingEmitter>()
    private var firstBuilt = false

    override fun createEmitter(): SseEmitter {
      val emitter =
        if (!firstBuilt) {
          firstBuilt = true
          RecordingEmitter(throwOnSend = true)
        } else {
          RecordingEmitter()
        }
      recorded.add(emitter)
      return emitter
    }
  }

  /**
   * Test double for [SseEmitter] that intercepts the `send(SseEventBuilder)` overload (the one the
   * publisher actually calls — `SseEmitter.event().name(…).data(…)` returns a builder) and the
   * `complete()` lifecycle hook. Doesn't go through Spring's underlying handler chain at all, so no
   * servlet container is required.
   */
  private class RecordingEmitter(private val throwOnSend: Boolean = false) : SseEmitter(0L) {
    val sendCount = AtomicInteger(0)
    val sendAttempts = AtomicInteger(0)
    var completed = false

    override fun send(builder: SseEventBuilder) {
      sendAttempts.incrementAndGet()
      // Generic `RuntimeException` is the point — the test simulates "any client-side fault"
      // and the publisher's contract is to handle it uniformly via complete-with-error. A more
      // specific type (e.g. `IOException`) would over-constrain the test fixture without making
      // the assertion sharper.
      @Suppress("TooGenericExceptionThrown")
      if (throwOnSend) throw RuntimeException("client disconnected")
      sendCount.incrementAndGet()
    }

    override fun complete() {
      completed = true
    }
  }

  companion object {
    /**
     * Long enough that two `Instant.now()` snapshots taken on either side of it differ by at least
     * 1 ms even on a fast machine, short enough not to slow the suite. 5 ms is the conventional
     * floor.
     */
    private const val SLEEP_MS_FOR_ELAPSED_GAP = 5L
  }
}
