package com.portfolioai.analysis.infrastructure

import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.infrastructure.persistence.AnalysisJobRepository
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeJobRepository
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [OrphanedJobCleanupListener]. The listener is a thin lifecycle hook over two bulk-
 * update queries — these tests pin one behaviour each :
 * 1. **Both tables get swept on boot** — the legacy `analysis_job` table is included even though
 *    the Phase 0 pipeline is frozen, because the table still exists and a future un-freeze
 *    shouldn't have to remember to add it back.
 * 2. **The marker message is the same for both** — keeps the UI's "this was orphaned, not a real
 *    error" detection logic single-stringed.
 * 3. **PENDING → ERROR is the only transition** — DONE / ERROR rows are left alone. We rely on the
 *    `WHERE j.status = :oldStatus` clause in the JPQL query to enforce this ; the test asserts that
 *    the call signature commits to PENDING as the source state.
 *
 * The actual SQL is exercised end-to-end by [com.portfolioai.BackendApplicationTests] which boots
 * the full context (Flyway + JPA + listener fires on `ApplicationReadyEvent`) — if the JPQL is
 * malformed Hibernate fails at startup before any test runs.
 */
class OrphanedJobCleanupListenerTest {

  private val narrativeRepo: TickerNarrativeJobRepository = mock()
  private val analysisRepo: AnalysisJobRepository = mock()

  @Test
  fun `flips PENDING to ERROR on both job tables with the orphan marker`() {
    // Both repos return non-zero counts — typical of a hot-reload mid-LLM call where one or two
    // jobs were in-flight when the previous JVM died.
    whenever(narrativeRepo.bulkUpdateStatus(any(), any(), any())).thenReturn(2)
    whenever(analysisRepo.bulkUpdateStatus(any(), any(), any())).thenReturn(1)

    OrphanedJobCleanupListener(narrativeRepo, analysisRepo).cleanupOrphanedJobs()

    verify(narrativeRepo)
      .bulkUpdateStatus(
        eq(JobStatus.PENDING),
        eq(JobStatus.ERROR),
        eq(OrphanedJobCleanupListener.ORPHAN_MESSAGE),
      )
    verify(analysisRepo)
      .bulkUpdateStatus(
        eq(JobStatus.PENDING),
        eq(JobStatus.ERROR),
        eq(OrphanedJobCleanupListener.ORPHAN_MESSAGE),
      )
  }

  @Test
  fun `is a no-op observable side-effect when no PENDING rows exist`() {
    // Clean boot — nothing was in-flight. Both repos report zero ; the listener should still call
    // through (trivially), no crash, no extra calls. Verifies the "happy path" of a healthy
    // shutdown / restart cycle.
    whenever(narrativeRepo.bulkUpdateStatus(any(), any(), any())).thenReturn(0)
    whenever(analysisRepo.bulkUpdateStatus(any(), any(), any())).thenReturn(0)

    OrphanedJobCleanupListener(narrativeRepo, analysisRepo).cleanupOrphanedJobs()

    verify(narrativeRepo).bulkUpdateStatus(any(), any(), any())
    verify(analysisRepo).bulkUpdateStatus(any(), any(), any())
  }

  @Test
  fun `never calls any repo with a non-PENDING source status`() {
    // Defensive test : the WHERE clause in the JPQL query depends on us passing PENDING as the
    // source state. A future refactor that broadened the source set (e.g. to include ERROR rows
    // for a retry-style flow) would need to be a deliberate decision, not an accident.
    OrphanedJobCleanupListener(narrativeRepo, analysisRepo).cleanupOrphanedJobs()

    verify(narrativeRepo, never()).bulkUpdateStatus(eq(JobStatus.DONE), any(), any())
    verify(narrativeRepo, never()).bulkUpdateStatus(eq(JobStatus.ERROR), any(), any())
    verify(analysisRepo, never()).bulkUpdateStatus(eq(JobStatus.DONE), any(), any())
    verify(analysisRepo, never()).bulkUpdateStatus(eq(JobStatus.ERROR), any(), any())
  }
}
