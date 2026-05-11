package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.infrastructure.persistence.PromptTemplateRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify

/**
 * Tests on [TickerNarrativePromptService] — the read-side of Phase 3 PR1. The service is the
 * boundary between the runner ([TickerNarrativeExecutor]) and the prompt persistence layer
 * (`prompt_template`). What we pin :
 *
 * - **DB-active row wins** — when the repository returns an active row for `narrative-default`, the
 *   service surfaces it verbatim. The runner gets the *currently configured* prompt, not the
 *   hardcoded constant.
 * - **Cache window absorbs bursts** — two back-to-back `activePrompt()` calls hit the repository
 *   only once. Critical for Phase 3 PR2 where we'll write a `PromptScore` per run : the score
 *   writer reads the same `id` we used in `complete(...)`, doing a fresh DB lookup each time would
 *   be wasteful and racey.
 * - **Fallback to the hardcoded constant** — when the repository returns null (DB empty, bootstrap
 *   before Flyway V8, or seed wiped manually), the service does NOT throw : it constructs a
 *   synthetic [PromptTemplate] backed by `NARRATIVE_SYSTEM_PROMPT`. This keeps the pipeline
 *   functional even when the DB is in an unexpected state — degrading silently is the contract the
 *   runner depends on.
 * - **`isFallback` is the persister's escape hatch** — the synthetic fallback row carries a
 *   sentinel UUID that's not in `prompt_template`. Persisting it as the FK on
 *   `ticker_narrative_snapshot` would 23503 ; the persister calls `isFallback(...)` and stores
 *   `null` instead. We pin both directions : `true` on the fallback, `false` on a DB row.
 * - **`invalidate` forces a re-read** — Phase 3 PR3 will activate a new prompt via the UI and call
 *   `invalidate()` so the next narrative run uses the new prompt without waiting for the 1-min TTL
 *   to expire.
 */
class TickerNarrativePromptServiceTest {

  private val repository: PromptTemplateRepository = mock()
  private val service = TickerNarrativePromptService(repository)

  // ---------------------------------------------------------------------- DB-backed path

  @Test
  fun `activePrompt returns the active row from the repository`() {
    val dbRow = dbActiveRow(version = "v3")
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default"))).willReturn(dbRow)

    val result = service.activePrompt()

    assertEquals(dbRow.id, result.id)
    assertEquals("v3", result.version)
    assertFalse(service.isFallback(result), "DB-backed row must NOT be tagged as fallback")
  }

  @Test
  fun `activePrompt caches subsequent reads within the cache window`() {
    // Phase 3 PR2 will fire one `activePrompt()` call for `complete()` then another for the
    // score writer ; we assert the repository is hit once across both. Without this guard, every
    // narrative run would double-query `prompt_template`.
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default")))
      .willReturn(dbActiveRow())

    repeat(5) { service.activePrompt() }

    verify(repository, times(1)).findFirstByNameAndIsActiveTrue(eq("narrative-default"))
  }

  // ---------------------------------------------------------------------- fallback path

  @Test
  fun `activePrompt falls back to the hardcoded prompt when no active row exists`() {
    // Bootstrap reality : Flyway V8 hasn't run yet (fresh clone before migrations apply), or
    // the seed was wiped manually. The runner must still be able to generate narratives — we
    // can't crash on a missing FK row when the pipeline already worked from a Kotlin constant
    // for two phases.
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default"))).willReturn(null)

    val result = service.activePrompt()

    assertTrue(service.isFallback(result), "no active row → service must surface its fallback")
    assertEquals(NARRATIVE_PROMPT_VERSION, result.version)
    assertEquals(
      NARRATIVE_SYSTEM_PROMPT,
      result.systemPrompt,
      "fallback systemPrompt must be the verbatim hardcoded constant — not a paraphrase",
    )
  }

  @Test
  fun `isFallback returns false on a DB-backed row even with the same version tag`() {
    // Defensive : two prompts can carry version "v2" — the seed and a future re-imported row.
    // The fallback discriminator must NOT be a version match, only the sentinel UUID.
    val dbRow = dbActiveRow(version = NARRATIVE_PROMPT_VERSION)
    assertFalse(service.isFallback(dbRow))
    // And the fallback IS detected on the synthetic row :
    val fallback = serviceFallback()
    assertTrue(service.isFallback(fallback))
    assertNotEquals(dbRow.id, fallback.id)
  }

  // ---------------------------------------------------------------------- invalidate

  @Test
  fun `invalidate forces a fresh repository read on the next call`() {
    // PR3's "Activate" click flips the active row in the DB ; without invalidation, the runner
    // would keep returning the stale prompt for up to 1 minute. We pin that `invalidate()` is
    // honoured immediately : two calls around an invalidate hit the repo twice.
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default")))
      .willReturn(dbActiveRow(version = "v2"))
      .willReturn(dbActiveRow(version = "v3"))

    val before = service.activePrompt()
    service.invalidate()
    val after = service.activePrompt()

    assertEquals("v2", before.version)
    assertEquals("v3", after.version)
    verify(repository, times(2)).findFirstByNameAndIsActiveTrue(eq("narrative-default"))
  }

  // ---------------------------------------------------------------------- isolation guard

  @Test
  fun `activePrompt only queries the narrative-default family`() {
    // Future Phase 4 will introduce `portfolio-aggregator` etc. — make sure today's lookup is
    // strictly scoped so a sibling family added later doesn't accidentally collide on cache key
    // or DB query.
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default")))
      .willReturn(dbActiveRow())

    service.activePrompt()

    verify(repository).findFirstByNameAndIsActiveTrue(eq("narrative-default"))
    verify(repository, never()).findFirstByNameAndIsActiveTrue(eq("portfolio-aggregator"))
  }

  // ---------------------------------------------------------------------- helpers

  private fun dbActiveRow(version: String = "v2"): PromptTemplate =
    PromptTemplate(
      name = "narrative-default",
      version = version,
      systemPrompt = "Persisted prompt body for $version",
      isActive = true,
    )

  // The fallback row is private inside the service ; the only public way to obtain it is by
  // calling `activePrompt()` against an empty repository. This helper isolates that detail so
  // the assertions stay focused.
  private fun serviceFallback(): PromptTemplate {
    val isolated = TickerNarrativePromptService(mock())
    return isolated.activePrompt()
  }
}
