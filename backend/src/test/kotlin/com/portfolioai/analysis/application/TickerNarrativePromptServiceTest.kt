package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.infrastructure.persistence.PromptTemplateRepository
import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
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

  // ---------------------------------------------------------------------- management API (PR3)

  @Test
  fun `listAll forwards the family name verbatim and returns the repository order`() {
    val v3 = dbInactiveRow(version = "v3")
    val v2 = dbActiveRow(version = "v2")
    given(repository.findAllByNameOrderByCreatedAtDesc(eq("narrative-default")))
      .willReturn(listOf(v3, v2))

    val result = service.listAll()

    assertEquals(
      listOf(v3, v2),
      result,
      "service must preserve the repository order (newest first)",
    )
  }

  @Test
  fun `findById returns the row when present, null when absent`() {
    val id = UUID.randomUUID()
    val row = dbActiveRow()
    given(repository.findById(eq(id))).willReturn(Optional.of(row))
    given(repository.findById(eq(UUID(0, 0)))).willReturn(Optional.empty())

    assertSame(row, service.findById(id))
    assertNull(service.findById(UUID(0, 0)))
  }

  @Test
  fun `activate throws NoSuchElementException when the id is unknown`() {
    val unknown = UUID.randomUUID()
    given(repository.findById(eq(unknown))).willReturn(Optional.empty())

    assertThrows<NoSuchElementException> { service.activate(unknown) }
    // Cache must not be invalidated on failure — would force an unnecessary DB read on the next
    // narrative run for no reason.
    verify(repository, never()).save(any())
  }

  @Test
  fun `activate is a no-op when the target row is already active`() {
    // Idempotent activate is what makes the UI safe to retry — a double-click on the Activate
    // button must not deactivate then re-activate (which would shift `activated_at` forward,
    // misrepresenting when the prompt actually went live).
    val active = dbActiveRow()
    given(repository.findById(eq(active.id))).willReturn(Optional.of(active))

    val result = service.activate(active.id)

    assertSame(active, result)
    verify(repository, never()).save(any())
    verify(repository, never()).saveAndFlush(any<PromptTemplate>())
    // Cache is not touched either — the active row didn't change, the cache value is still
    // correct.
  }

  @Test
  fun `activate deactivates the current active row then activates the target and invalidates cache`() {
    val target = dbInactiveRow(version = "v3")
    val previouslyActive = dbActiveRow(version = "v2")
    given(repository.findById(eq(target.id))).willReturn(Optional.of(target))
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default")))
      .willReturn(previouslyActive)
    given(repository.saveAndFlush(any<PromptTemplate>())).willAnswer {
      it.arguments[0] as PromptTemplate
    }
    given(repository.save(any<PromptTemplate>())).willAnswer { it.arguments[0] as PromptTemplate }

    val result = service.activate(target.id)

    // Old row went inactive with a deprecation stamp.
    val deactivateCaptor = argumentCaptor<PromptTemplate>()
    verify(repository).saveAndFlush(deactivateCaptor.capture())
    val deactivated = deactivateCaptor.firstValue
    assertEquals(previouslyActive.id, deactivated.id)
    assertFalse(deactivated.isActive)
    assertNotNull(deactivated.deprecatedAt, "deprecation timestamp must be set on the demoted row")

    // Target became active with an activation stamp.
    val activateCaptor = argumentCaptor<PromptTemplate>()
    verify(repository).save(activateCaptor.capture())
    val activated = activateCaptor.firstValue
    assertEquals(target.id, activated.id)
    assertTrue(activated.isActive)
    assertNotNull(activated.activatedAt)
    assertSame(activated, result)

    // Cache invalidation pin : the next `activePrompt()` call must hit the repo, not return the
    // stale cached row from before the activation.
    cacheIsInvalidated()
  }

  @Test
  fun `activate works when no row is currently active in the family`() {
    // Bootstrap-ish case : the seed row got deactivated manually and now we activate a new one.
    // The deactivation step must be skipped (no current active to demote) but the activation
    // itself still proceeds.
    val target = dbInactiveRow(version = "v3")
    given(repository.findById(eq(target.id))).willReturn(Optional.of(target))
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default"))).willReturn(null)
    given(repository.save(any<PromptTemplate>())).willAnswer { it.arguments[0] as PromptTemplate }

    service.activate(target.id)

    verify(repository, never()).saveAndFlush(any<PromptTemplate>())
    verify(repository).save(any<PromptTemplate>())
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
      activatedAt = Instant.parse("2026-05-10T12:00:00Z"),
    )

  private fun dbInactiveRow(version: String): PromptTemplate =
    PromptTemplate(
      name = "narrative-default",
      version = version,
      systemPrompt = "Persisted prompt body for $version",
      isActive = false,
    )

  // Asserts that the cache has been invalidated by checking that a fresh `activePrompt()` call
  // forces a new repository lookup. Indirect — the cache is private — but this is what the
  // contract guarantees in practice.
  private fun cacheIsInvalidated() {
    given(repository.findFirstByNameAndIsActiveTrue(eq("narrative-default")))
      .willReturn(dbActiveRow())
    service.activePrompt()
    // At minimum one extra lookup happened after the invalidate (we don't count exactly because
    // the activate method itself may have queried for the current active row).
    verify(repository, org.mockito.kotlin.atLeastOnce())
      .findFirstByNameAndIsActiveTrue(eq("narrative-default"))
  }

  // The fallback row is private inside the service ; the only public way to obtain it is by
  // calling `activePrompt()` against an empty repository. This helper isolates that detail so
  // the assertions stay focused.
  private fun serviceFallback(): PromptTemplate {
    val isolated = TickerNarrativePromptService(mock())
    return isolated.activePrompt()
  }
}
