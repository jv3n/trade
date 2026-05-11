package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.PromptScore
import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.infrastructure.persistence.PromptScoreRepository
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [PromptScoreRecorder] — the write side of Phase 3 PR2. Pins the contract that the
 * executor's `finally` block relies on : every run with a real prompt template gets one
 * `prompt_score` row, the fallback template path skips silently, and the entity carries the exact
 * metrics the executor measured.
 *
 * What we pin :
 *
 * - **Happy path persists with all fields verbatim** — the entity passed to the repository carries
 *   exactly the latency / retry / flags / snapshot id the executor handed in, plus the FK to the
 *   active prompt template. The captor asserts each field so a typo in the entity constructor would
 *   surface here rather than corrupting the row silently.
 * - **Failure path persists with `snapshot_id = null`** — when the executor's loop exhausts both
 *   attempts, no snapshot is created but we still write the score row (the only place where
 *   `parse_failed` / `validator_failed` flags survive). Pin that the recorder accepts a null
 *   snapshot id without complaining.
 * - **Fallback template skips the write** — the synthetic fallback row carries a sentinel UUID
 *   that's not in `prompt_template` ; persisting a score with that FK would 23503. The recorder
 *   asks the service `isFallback(...)`, returns early, and does NOT touch the repository.
 * - **Flags are independent** — `parse_failed` and `validator_failed` can both be true (e.g.
 *   attempt 1 KO parser, attempt 2 KO validator) ; the recorder doesn't second-guess the executor's
 *   measurement.
 */
class PromptScoreRecorderTest {

  private val repository: PromptScoreRepository = mock()
  private val promptService: TickerNarrativePromptService = mock()
  private val recorder = PromptScoreRecorder(repository, promptService)

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `record persists a score row with the metrics the executor handed in`() {
    val template = dbPromptTemplate(id = UUID.randomUUID())
    val snapshotId = UUID.randomUUID()
    given(promptService.isFallback(template)).willReturn(false)
    val captor = argumentCaptor<PromptScore>()

    recorder.record(
      promptTemplate = template,
      snapshotId = snapshotId,
      latencyMs = 4_823,
      retryCount = 0,
      parseFailed = false,
      validatorFailed = false,
    )

    verify(repository).save(captor.capture())
    val saved = captor.firstValue
    assertEquals(snapshotId, saved.snapshotId)
    assertEquals(template.id, saved.promptTemplateId)
    assertEquals(4_823, saved.latencyMs)
    assertEquals(0, saved.retryCount)
    assertFalse(saved.parseFailed)
    assertFalse(saved.validatorFailed)
    // User feedback starts neutral — PR5 will flip it when the user clicks 👍/👎.
    assertEquals(0.toShort(), saved.userThumbs)
    // LLM judge column reserved for a future Phase 3 iteration — must stay null on the write
    // path (writing it accidentally with a default value would break the « no judge yet » filter).
    assertNull(saved.llmJudgeScore)
  }

  // ---------------------------------------------------------------------- failure path

  @Test
  fun `record persists with snapshotId=null when the executor's loop exhausted both attempts`() {
    val template = dbPromptTemplate()
    given(promptService.isFallback(template)).willReturn(false)
    val captor = argumentCaptor<PromptScore>()

    recorder.record(
      promptTemplate = template,
      snapshotId = null,
      latencyMs = 12_500,
      retryCount = 1,
      parseFailed = true,
      validatorFailed = true,
    )

    verify(repository).save(captor.capture())
    val saved = captor.firstValue
    assertNull(saved.snapshotId)
    assertEquals(1, saved.retryCount)
    assertTrue(saved.parseFailed)
    assertTrue(saved.validatorFailed)
  }

  // ---------------------------------------------------------------------- fallback skip

  @Test
  fun `record skips the write on the fallback template (no FK target)`() {
    // The fallback `PromptTemplate` carries a sentinel UUID that's not in `prompt_template` ;
    // writing a `prompt_score` with that FK would crash on integrity violation. The recorder
    // detects this via the service and skips silently — observability lost on that degraded path
    // is an accepted trade for keeping the schema honest. See class-level note.
    val fallback = dbPromptTemplate()
    given(promptService.isFallback(fallback)).willReturn(true)

    recorder.record(
      promptTemplate = fallback,
      snapshotId = UUID.randomUUID(),
      latencyMs = 3_400,
      retryCount = 0,
      parseFailed = false,
      validatorFailed = false,
    )

    verify(repository, never()).save(any<PromptScore>())
  }

  // ---------------------------------------------------------------------- flag independence

  @Test
  fun `record preserves flag combinations independently — both true, both false, mixed`() {
    val template = dbPromptTemplate()
    given(promptService.isFallback(template)).willReturn(false)
    val captor = argumentCaptor<PromptScore>()

    // Three plausible combinations the executor can emit. The recorder doesn't second-guess
    // them : pin that each is forwarded verbatim.
    recorder.record(
      template,
      UUID.randomUUID(),
      1_000,
      0,
      parseFailed = false,
      validatorFailed = false,
    )
    recorder.record(template, null, 9_000, 1, parseFailed = true, validatorFailed = true)
    recorder.record(
      template,
      UUID.randomUUID(),
      5_500,
      1,
      parseFailed = false,
      validatorFailed = true,
    )

    verify(repository, org.mockito.kotlin.times(3)).save(captor.capture())
    val (clean, bothFailed, validatorOnly) = captor.allValues
    assertFalse(clean.parseFailed)
    assertFalse(clean.validatorFailed)
    assertTrue(bothFailed.parseFailed)
    assertTrue(bothFailed.validatorFailed)
    assertFalse(validatorOnly.parseFailed)
    assertTrue(validatorOnly.validatorFailed)
  }

  // ---------------------------------------------------------------------- helpers

  private fun dbPromptTemplate(id: UUID = UUID.randomUUID()): PromptTemplate =
    PromptTemplate(
      id = id,
      name = "narrative-default",
      version = "v2",
      systemPrompt = "Body",
      isActive = true,
    )
}
