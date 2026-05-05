package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeSnapshotRepository
import java.math.BigDecimal
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mock
import org.mockito.Mockito.never
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.times

/**
 * Tests on [TickerNarrativeService] — the entry point for narrative generation. The service is
 * **load-bearing for cost** : it decides when to actually call the LLM (Claude API costs cents per
 * call, Ollama Mistral costs 30-60 s of CPU). A bug here that re-fires the runner on every click is
 * silent in the UI but visible on the Anthropic invoice or the user's wait time.
 *
 * Three branches verified, in priority order :
 * 1. **A `PENDING` job already exists for the symbol within the dedup window** — re-clicks reuse
 *    that job. Runner NOT fired ; snapshot repo NOT queried.
 * 2. **A snapshot exists and is fresh (≤ 30 min)** — create a new job and immediately mark it
 *    `DONE` pointing at the cached snapshot. Runner NOT fired. The frontend always polls a job,
 *    even on cache hit, so this branch keeps the UX uniform.
 * 3. **Stale or no snapshot** — create a `PENDING` job and fire the async runner.
 *
 * Plus two extra checks : symbol case is normalised to uppercase before every lookup (so `aapl` and
 * `AAPL` share the same dedup / cache view), and `latestSnapshot` simply delegates with the same
 * uppercasing.
 *
 * Mockito (project default for repo mocks, see `PortfolioControllerTest`).
 */
@ExtendWith(MockitoExtension::class)
class TickerNarrativeServiceTest {

  @Mock private lateinit var jobStore: TickerNarrativeJobStore
  @Mock private lateinit var snapshotRepo: TickerNarrativeSnapshotRepository
  @Mock private lateinit var runner: TickerNarrativeRunner

  private lateinit var service: TickerNarrativeService

  @BeforeEach
  fun setUp() {
    service = TickerNarrativeService(jobStore, snapshotRepo, runner)
  }

  // ---------------------------------------------------------------- helpers

  private fun pendingJob(symbol: String = "AAPL", id: UUID = UUID.randomUUID()) =
    TickerNarrativeJob(id = id, symbol = symbol, status = JobStatus.PENDING)

  private fun doneJob(symbol: String = "AAPL", id: UUID = UUID.randomUUID(), snapshotId: UUID) =
    TickerNarrativeJob(id = id, symbol = symbol, status = JobStatus.DONE, snapshotId = snapshotId)

  /** Snapshot generated [ageMinutes] ago. Defaults to 5 min ago = comfortably inside the window. */
  private fun snapshot(
    symbol: String = "AAPL",
    id: UUID = UUID.randomUUID(),
    ageMinutes: Long = 5,
  ) =
    TickerNarrativeSnapshot(
      id = id,
      symbol = symbol,
      generatedAt = Instant.now().minus(ageMinutes, ChronoUnit.MINUTES),
      price = BigDecimal("180.00"),
      indicatorsJson = "{}",
      summary = "Sample summary.",
      sentiment = Sentiment.NEUTRAL,
      keyPointsJson = "[]",
      modelUsed = "claude:test",
    )

  // ----------------------------------------------------------------------
  // Branch 1 — pending dedup
  // ----------------------------------------------------------------------

  @Test
  fun `reuses an existing PENDING job for the same symbol — no runner, no snapshot lookup`() {
    val existing = pendingJob()
    given(jobStore.pendingFor("AAPL")).willReturn(existing)

    val result = service.startAsync("AAPL")

    assertSame(existing, result)
    // Critical : neither branch 2 nor 3 was reached.
    then(snapshotRepo).should(never()).findFirstBySymbolOrderByGeneratedAtDesc(any())
    then(runner).should(never()).run(any(), any())
    then(jobStore).should(never()).create(any())
  }

  // ----------------------------------------------------------------------
  // Branch 2 — fresh snapshot cache hit
  // ----------------------------------------------------------------------

  @Test
  fun `reuses a fresh snapshot under 30 min — completes a new job synchronously, no runner`() {
    val cached = snapshot(ageMinutes = 5)
    val newJob = pendingJob()
    given(jobStore.pendingFor("AAPL")).willReturn(null)
    given(snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc("AAPL")).willReturn(cached)
    given(jobStore.create("AAPL")).willReturn(newJob)
    val doneJob = doneJob(id = newJob.id, snapshotId = cached.id)
    given(jobStore.get(newJob.id)).willReturn(doneJob)

    val result = service.startAsync("AAPL")

    // Job created, immediately completed pointing at the cached snapshot, never went through
    // the runner. The frontend will see DONE on its first poll.
    then(jobStore).should().create("AAPL")
    then(jobStore).should().complete(newJob.id, cached.id)
    then(runner).should(never()).run(any(), any())
    assertEquals(JobStatus.DONE, result.status)
    assertEquals(cached.id, result.snapshotId)
  }

  @Test
  fun `treats a snapshot just under 30 min as still fresh`() {
    // The window is "≤ 30 min" — we assert the inside of the window with 29 min rather than
    // exactly at 30 min. The exact-boundary case is impossible to assert reliably without an
    // injectable Clock : `Instant.now()` advances by microseconds between the snapshot
    // construction here and the service's `Duration.between(...)` check, so a "30 minutes ago"
    // snapshot ends up at 30 min + epsilon and slips out of the window non-deterministically.
    val nearlyExpired = snapshot(ageMinutes = 29)
    val newJob = pendingJob()
    given(jobStore.pendingFor("AAPL")).willReturn(null)
    given(snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc("AAPL")).willReturn(nearlyExpired)
    given(jobStore.create("AAPL")).willReturn(newJob)
    given(jobStore.get(newJob.id))
      .willReturn(doneJob(id = newJob.id, snapshotId = nearlyExpired.id))

    service.startAsync("AAPL")

    then(runner).should(never()).run(any(), any())
    then(jobStore).should().complete(newJob.id, nearlyExpired.id)
  }

  // ----------------------------------------------------------------------
  // Branch 3 — fresh kick (stale snapshot or no snapshot)
  // ----------------------------------------------------------------------

  @Test
  fun `kicks the async runner when the latest snapshot is older than 30 min`() {
    val stale = snapshot(ageMinutes = 31)
    val newJob = pendingJob()
    given(jobStore.pendingFor("AAPL")).willReturn(null)
    given(snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc("AAPL")).willReturn(stale)
    given(jobStore.create("AAPL")).willReturn(newJob)

    val result = service.startAsync("AAPL")

    then(jobStore).should().create("AAPL")
    then(runner).should(times(1)).run("AAPL", newJob.id)
    // No `complete` call — the runner is in charge of completing the job.
    then(jobStore).should(never()).complete(any(), any())
    assertSame(newJob, result)
  }

  @Test
  fun `kicks the async runner when no snapshot exists for the symbol`() {
    val newJob = pendingJob(symbol = "NVDA")
    given(jobStore.pendingFor("NVDA")).willReturn(null)
    given(snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc("NVDA")).willReturn(null)
    given(jobStore.create("NVDA")).willReturn(newJob)

    val result = service.startAsync("NVDA")

    then(runner).should(times(1)).run("NVDA", newJob.id)
    assertSame(newJob, result)
  }

  // ----------------------------------------------------------------------
  // Symbol normalisation
  // ----------------------------------------------------------------------

  @Test
  fun `uppercases the symbol before every lookup so aapl and AAPL share the same view`() {
    // Lower-case input from the URL should not break dedup or cache hits — the service
    // normalises before delegating to the stores. A regression here would create separate
    // dedup buckets for `aapl` and `AAPL`, doubling LLM calls.
    val existing = pendingJob()
    given(jobStore.pendingFor("AAPL")).willReturn(existing)

    val result = service.startAsync("aapl")

    assertSame(existing, result)
    then(jobStore).should().pendingFor("AAPL")
    then(jobStore).should(never()).pendingFor("aapl")
  }

  @Test
  fun `latestSnapshot delegates to the repo with the symbol uppercased`() {
    val snap = snapshot()
    given(snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc("AAPL")).willReturn(snap)

    assertSame(snap, service.latestSnapshot("aapl"))
    then(snapshotRepo).should().findFirstBySymbolOrderByGeneratedAtDesc("AAPL")
  }

  @Test
  fun `latestSnapshot returns null when the repo has nothing`() {
    given(snapshotRepo.findFirstBySymbolOrderByGeneratedAtDesc(eq("MSFT"))).willReturn(null)
    assertNull(service.latestSnapshot("MSFT"))
  }
}
