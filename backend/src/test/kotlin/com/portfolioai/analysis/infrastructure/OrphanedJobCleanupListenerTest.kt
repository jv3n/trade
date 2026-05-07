package com.portfolioai.analysis.infrastructure

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeJobRepository
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [OrphanedJobCleanupListener]. The listener is a thin lifecycle hook over a single bulk-
 * update query — these tests pin one behaviour each :
 * 1. **`ticker_narrative_job` gets swept on boot** with the orphan marker, so a poll right after a
 *    hot-reload or crash sees a meaningful failure rather than spin forever on PENDING.
 * 2. **PENDING → ERROR is the only transition** — DONE / ERROR rows are left alone. We rely on the
 *    `WHERE j.status = :oldStatus` clause in the JPQL query to enforce this ; the test asserts that
 *    the call signature commits to PENDING as the source state.
 *
 * The actual SQL is exercised end-to-end by [com.portfolioai.BackendApplicationTests] which boots
 * the full context (Flyway + JPA + listener fires on `ApplicationReadyEvent`) — if the JPQL is
 * malformed Hibernate fails at startup before any test runs.
 */
class OrphanedJobCleanupListenerTest {

  private val narrativeRepo: TickerNarrativeJobRepository = mock()

  @Test
  fun `flips PENDING to ERROR on the narrative job table with the orphan marker`() {
    // Non-zero count — typical of a hot-reload mid-LLM call where one or two jobs were in-flight
    // when the previous JVM died.
    whenever(narrativeRepo.bulkUpdateStatus(any(), any(), any())).thenReturn(2)

    OrphanedJobCleanupListener(narrativeRepo).cleanupOrphanedJobs()

    verify(narrativeRepo)
      .bulkUpdateStatus(
        eq(JobStatus.PENDING),
        eq(JobStatus.ERROR),
        eq(OrphanedJobCleanupListener.ORPHAN_MESSAGE),
      )
  }

  @Test
  fun `is a no-op observable side-effect when no PENDING rows exist`() {
    // Clean boot — nothing was in-flight. Repo reports zero ; the listener should still call
    // through (trivially), no crash, no extra calls. Verifies the "happy path" of a healthy
    // shutdown / restart cycle.
    whenever(narrativeRepo.bulkUpdateStatus(any(), any(), any())).thenReturn(0)

    OrphanedJobCleanupListener(narrativeRepo).cleanupOrphanedJobs()

    verify(narrativeRepo).bulkUpdateStatus(any(), any(), any())
  }

  @Test
  fun `never calls the repo with a non-PENDING source status`() {
    // Defensive test : the WHERE clause in the JPQL query depends on us passing PENDING as the
    // source state. A future refactor that broadened the source set (e.g. to include ERROR rows
    // for a retry-style flow) would need to be a deliberate decision, not an accident.
    OrphanedJobCleanupListener(narrativeRepo).cleanupOrphanedJobs()

    verify(narrativeRepo, never()).bulkUpdateStatus(eq(JobStatus.DONE), any(), any())
    verify(narrativeRepo, never()).bulkUpdateStatus(eq(JobStatus.ERROR), any(), any())
  }
}
