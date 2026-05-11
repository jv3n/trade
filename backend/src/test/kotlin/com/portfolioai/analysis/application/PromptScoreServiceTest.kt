package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.PromptScore
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.persistence.PromptScoreRepository
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeSnapshotRepository
import java.math.BigDecimal
import java.util.Optional
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [PromptScoreService] — Phase 3 PR5 thumbs update. What we pin :
 *
 * - **Happy path persists the new thumbs value** verbatim. The score row's other fields (the
 *   measured metrics from PR2) are left untouched — thumbs is a side-channel signal layered on top
 *   of the run-time scoring, not a replacement.
 * - **Validation guards** : the DB CHECK constraint already restricts the value to `{-1, 0, 1}`,
 *   but the service re-validates so the API surfaces a clean 400 instead of letting the integrity
 *   violation bubble. Pinned for every out-of-range value the user could plausibly send.
 * - **Upsert when the score row is missing** : if the snapshot exists with a `prompt_template_id`
 *   but no `prompt_score` row, the thumbs PATCH creates one with default metrics (latency = 0,
 *   retry = 0, flags false) + the user's vote. Covers snapshots generated before PR2 wired the
 *   recorder, where the V8 backfill set the FK but no score was ever written. Without the upsert,
 *   the user would 404 on a snapshot they have no way to fix.
 * - **404 path** : the only genuine 404s are now (a) snapshot id unknown, (b) snapshot exists but
 *   its `prompt_template_id` is null (fallback prompt path — no FK target to write).
 * - **Idempotent re-click** : flipping to the same value still writes (one extra UPDATE) but does
 *   not flip the value — pinned so a future micro-optimisation that skips the write on no-change
 *   can't accidentally break the « server confirms what's persisted » UX.
 */
class PromptScoreServiceTest {

  private val repository: PromptScoreRepository = mock()
  private val snapshotRepository: TickerNarrativeSnapshotRepository = mock()
  private val service = PromptScoreService(repository, snapshotRepository)

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `setThumbs persists the new value and leaves the other fields untouched`() {
    val snapshotId = UUID.randomUUID()
    val score = scoreRow(snapshotId)
    given(repository.findFirstBySnapshotId(eq(snapshotId))).willReturn(score)
    given(repository.save(any<PromptScore>())).willAnswer { it.arguments[0] as PromptScore }
    val captor = argumentCaptor<PromptScore>()

    val result = service.setThumbs(snapshotId, 1)

    verify(repository).save(captor.capture())
    val written = captor.firstValue
    assertEquals(1.toShort(), written.userThumbs)
    // Other metrics from PR2 must round-trip unchanged.
    assertEquals(score.latencyMs, written.latencyMs)
    assertEquals(score.retryCount, written.retryCount)
    assertEquals(score.parseFailed, written.parseFailed)
    assertEquals(score.validatorFailed, written.validatorFailed)
    assertEquals(score.promptTemplateId, written.promptTemplateId)
    assertEquals(1.toShort(), result.userThumbs)
  }

  @Test
  fun `setThumbs accepts -1 0 and 1 — the three legal values per the DB CHECK constraint`() {
    val snapshotId = UUID.randomUUID()
    given(repository.findFirstBySnapshotId(eq(snapshotId))).willReturn(scoreRow(snapshotId))
    given(repository.save(any<PromptScore>())).willAnswer { it.arguments[0] as PromptScore }

    service.setThumbs(snapshotId, -1)
    service.setThumbs(snapshotId, 0)
    service.setThumbs(snapshotId, 1)

    verify(repository, org.mockito.kotlin.times(3)).save(any<PromptScore>())
  }

  // ---------------------------------------------------------------------- validation guard

  @Test
  fun `setThumbs rejects out-of-range values before touching the repository`() {
    val snapshotId = UUID.randomUUID()

    assertThrows<IllegalArgumentException> { service.setThumbs(snapshotId, 2) }
    assertThrows<IllegalArgumentException> { service.setThumbs(snapshotId, -2) }
    assertThrows<IllegalArgumentException> { service.setThumbs(snapshotId, 42) }
    // Pin that we short-circuit before the DB lookup — the row could legitimately not exist
    // (fallback path), and surfacing a 404 for a 400 error would be misleading.
    verify(repository, never()).findFirstBySnapshotId(any())
    verify(repository, never()).save(any<PromptScore>())
  }

  // ---------------------------------------------------------------------- upsert path

  @Test
  fun `setThumbs creates a fresh score row when the snapshot has no prior score`() {
    // Real-world : snapshot was generated before PR2 wired the recorder, so the V8 backfill set
    // its `prompt_template_id` (matched on `prompt_version = 'v2'`) but no `prompt_score` row
    // ever landed. The thumbs PATCH must NOT 404 here — it would leave the user with no way to
    // recover. We create a fresh row with zeroed metrics (honest : we have no measurement) + the
    // vote.
    val snapshotId = UUID.randomUUID()
    val templateId = UUID.randomUUID()
    given(repository.findFirstBySnapshotId(eq(snapshotId))).willReturn(null)
    given(snapshotRepository.findById(eq(snapshotId)))
      .willReturn(Optional.of(snapshotRow(snapshotId, templateId)))
    given(repository.save(any<PromptScore>())).willAnswer { it.arguments[0] as PromptScore }
    val captor = argumentCaptor<PromptScore>()

    val saved = service.setThumbs(snapshotId, 1)

    verify(repository).save(captor.capture())
    val created = captor.firstValue
    assertEquals(snapshotId, created.snapshotId)
    assertEquals(templateId, created.promptTemplateId)
    assertEquals(0, created.latencyMs, "no measurement available — pin zero rather than fake one")
    assertEquals(0, created.retryCount)
    assertEquals(1.toShort(), created.userThumbs)
    assertNull(created.llmJudgeScore)
    assertSame(created, saved)
  }

  // ---------------------------------------------------------------------- 404 path

  @Test
  fun `setThumbs throws when no score row AND the snapshot itself does not exist`() {
    val snapshotId = UUID.randomUUID()
    given(repository.findFirstBySnapshotId(eq(snapshotId))).willReturn(null)
    given(snapshotRepository.findById(eq(snapshotId))).willReturn(Optional.empty())

    assertThrows<NoSuchElementException> { service.setThumbs(snapshotId, 1) }
    verify(repository, never()).save(any<PromptScore>())
  }

  @Test
  fun `setThumbs throws when the snapshot has a null prompt_template_id (fallback prompt path)`() {
    // The fallback prompt path stamps a snapshot without an FK to `prompt_template`. The
    // `prompt_score` row's `prompt_template_id` column is NOT NULL, so we can't create one
    // retroactively — 404 is the honest answer (the frontend's UI guard should have hidden
    // the thumbs button on this snapshot anyway).
    val snapshotId = UUID.randomUUID()
    given(repository.findFirstBySnapshotId(eq(snapshotId))).willReturn(null)
    given(snapshotRepository.findById(eq(snapshotId)))
      .willReturn(Optional.of(snapshotRow(snapshotId, promptTemplateId = null)))

    assertThrows<NoSuchElementException> { service.setThumbs(snapshotId, 1) }
    verify(repository, never()).save(any<PromptScore>())
  }

  // ---------------------------------------------------------------------- idempotent re-click

  @Test
  fun `setThumbs re-applied with the same value still writes (server confirms persistence)`() {
    // The UX guarantees that the value the frontend hands in is what the server reads back. A
    // skipped-on-no-change optimization would break that confirmation — pin the contract here so
    // a future micro-tweak can't break it silently.
    val snapshotId = UUID.randomUUID()
    val score = scoreRow(snapshotId, currentThumbs = 1)
    given(repository.findFirstBySnapshotId(eq(snapshotId))).willReturn(score)
    given(repository.save(any<PromptScore>())).willAnswer { it.arguments[0] as PromptScore }

    service.setThumbs(snapshotId, 1)

    verify(repository).save(any<PromptScore>())
  }

  // ---------------------------------------------------------------------- helpers

  private fun scoreRow(snapshotId: UUID, currentThumbs: Short = 0): PromptScore =
    PromptScore(
      snapshotId = snapshotId,
      promptTemplateId = UUID.randomUUID(),
      latencyMs = 4_200,
      retryCount = 0,
      parseFailed = false,
      validatorFailed = false,
      userThumbs = currentThumbs,
    )

  private fun snapshotRow(snapshotId: UUID, promptTemplateId: UUID?): TickerNarrativeSnapshot =
    TickerNarrativeSnapshot(
      id = snapshotId,
      symbol = "AAPL",
      price = BigDecimal("180.00"),
      indicatorsJson = "{}",
      summary = "Body",
      sentiment = Sentiment.BULLISH,
      keyPointsJson = "[]",
      modelUsed = "claude:test",
      promptVersion = "v2",
      promptTemplateId = promptTemplateId,
    )
}
