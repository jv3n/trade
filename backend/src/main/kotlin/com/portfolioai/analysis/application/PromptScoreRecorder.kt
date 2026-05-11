package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.PromptScore
import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.infrastructure.persistence.PromptScoreRepository
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Persists one `prompt_score` row at the end of each narrative run. Phase 3 PR2 — pure
 * observability writer ; no UI consumes this row yet (PR5 will read it back for the thumbs 👍/👎
 * update, PR6 for the per-prompt stats charts).
 *
 * Called from [TickerNarrativeExecutor]'s `finally` so the score is written on **every** run,
 * success or failure. Capturing the failure side is important — `parse_failed` and
 * `validator_failed` are the cases that motivate prompt improvement work, losing them would empty
 * the rule's signal.
 *
 * **Fallback path skipped on purpose** — when [TickerNarrativePromptService.activePrompt] returns
 * its synthetic fallback (sentinel UUID, no row in `prompt_template`), persisting a score would
 * 23503 on the FK. We log at `debug` and skip. The fallback is rare (only triggers when Flyway V8
 * hasn't run or the seed was wiped), so losing observability there is an acceptable trade for
 * keeping the schema honest.
 */
@Component
class PromptScoreRecorder(
  private val repository: PromptScoreRepository,
  private val promptService: TickerNarrativePromptService,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun record(
    promptTemplate: PromptTemplate,
    snapshotId: UUID?,
    latencyMs: Int,
    retryCount: Int,
    parseFailed: Boolean,
    validatorFailed: Boolean,
  ) {
    if (promptService.isFallback(promptTemplate)) {
      log.debug("Skipping prompt_score write for fallback template (sentinel UUID, no FK target)")
      return
    }
    repository.save(
      PromptScore(
        snapshotId = snapshotId,
        promptTemplateId = promptTemplate.id,
        latencyMs = latencyMs,
        retryCount = retryCount,
        parseFailed = parseFailed,
        validatorFailed = validatorFailed,
      )
    )
    log.debug(
      "Recorded prompt_score promptTemplateId={} snapshotId={} latencyMs={} retryCount={} parseFailed={} validatorFailed={}",
      promptTemplate.id,
      snapshotId,
      latencyMs,
      retryCount,
      parseFailed,
      validatorFailed,
    )
  }
}
