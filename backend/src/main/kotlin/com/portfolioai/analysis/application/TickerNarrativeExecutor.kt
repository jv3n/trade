package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.JobPhase
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.llm.LlmClient
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.TickerSnapshot
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Orchestrates one narrative generation run. Deliberately **not** `@Transactional` — the slow LLM
 * call must not hold a DB connection (legacy convention). The two surrounding DB phases live in
 * [TickerService] (loads market data — itself transactional only when needed) and
 * [TickerNarrativePersister].
 *
 * Parse / validate / re-prompt loop : one initial call + at most one retry with the validator's
 * errors as feedback. If both attempts fail, throws — there's no meaningful "fallback" for a
 * free-form narrative.
 *
 * Emits per-phase [com.portfolioai.analysis.domain.JobEvent]s via [JobEventPublisher] so the UI can
 * show "Calling LLM (38s)…" instead of a muted spinner. The runner wraps this method with the
 * terminal [JobPhase.DONE] / [JobPhase.ERROR] events.
 *
 * **Score collection (Phase 3 PR2)** — at the end of every run, success or failure, a
 * [com.portfolioai.analysis.domain.PromptScore] row is persisted via [PromptScoreRecorder]. The
 * write lives in a `finally` so the failure case (both attempts KO → throw) still surfaces the
 * `parse_failed` / `validator_failed` flags that motivate prompt tuning. Latency, retry count and
 * the active `prompt_template_id` are tracked as the loop progresses.
 */
@Component
class TickerNarrativeExecutor(
  private val tickerService: TickerService,
  private val llmClient: LlmClient,
  private val parser: TickerNarrativeParser,
  private val validator: TickerNarrativeValidator,
  private val persister: TickerNarrativePersister,
  private val publisher: JobEventPublisher,
  private val promptService: TickerNarrativePromptService,
  private val scoreRecorder: PromptScoreRecorder,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun execute(symbol: String, jobId: UUID): TickerNarrativeSnapshot {
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    val market: TickerSnapshot = tickerService.load(symbol)
    val indicators =
      market.indicators
        ?: throw IllegalStateException("No indicators computed for $symbol — series too short")

    // Active prompt resolved once per run — within one run, the prompt does not change even if a
    // user activates a new version mid-LLM-call. Cache TTL 1 min on the service side absorbs the
    // burst when `n` requests fire at once.
    val prompt = promptService.activePrompt()
    val userMessage = buildNarrativeUserMessage(market.quote, indicators)

    // Score tracking — populated as the loop progresses, written in `finally` so both success
    // and terminal failure surface a `prompt_score` row. `savedSnapshotId` stays null when we
    // throw ; the recorder handles that with a nullable FK.
    val startedAtMs = System.currentTimeMillis()
    var retryCount = 0
    var parseFailed = false
    var validatorFailed = false
    var savedSnapshotId: UUID? = null

    try {
      var lastErrors: List<String>? = null
      repeat(MAX_ATTEMPTS) { attempt ->
        val attemptIndex = attempt + 1
        val message =
          if (lastErrors == null) userMessage else userMessage + retryFeedback(lastErrors!!)
        log.info(
          "Calling LLM for narrative symbol={} promptVersion={} (attempt {}/{})",
          symbol,
          prompt.version,
          attemptIndex,
          MAX_ATTEMPTS,
        )
        publisher.publish(jobId, JobPhase.CALLING_LLM, attempt = attemptIndex)
        val raw = llmClient.complete(prompt.systemPrompt, message, maxTokens = 600)
        publisher.publish(jobId, JobPhase.RECEIVED_RAW, attempt = attemptIndex)
        log.debug("Raw narrative response (attempt {}): {}", attemptIndex, raw)

        publisher.publish(jobId, JobPhase.PARSING, attempt = attemptIndex)
        val parsed =
          try {
            parser.parse(raw)
          } catch (e: Exception) {
            log.warn("Narrative attempt {} failed parsing: {}", attemptIndex, e.message)
            parseFailed = true
            lastErrors = listOf("Your previous response was not valid JSON: ${e.message}")
            if (attemptIndex < MAX_ATTEMPTS) {
              publisher.publish(jobId, JobPhase.RETRY_PROMPT, attempt = attemptIndex)
              retryCount++
            }
            return@repeat
          }

        publisher.publish(jobId, JobPhase.VALIDATING, attempt = attemptIndex)
        when (val result = validator.validate(parsed)) {
          NarrativeValidationResult.Valid -> {
            log.info("Narrative valid on attempt {} symbol={}", attemptIndex, symbol)
            publisher.publish(jobId, JobPhase.PERSISTING, attempt = attemptIndex)
            val snapshot =
              persister.persist(symbol, indicators, parsed, llmClient.modelId(), prompt)
            savedSnapshotId = snapshot.id
            return snapshot
          }
          is NarrativeValidationResult.Invalid -> {
            log.warn("Narrative attempt {} failed validation: {}", attemptIndex, result.errors)
            validatorFailed = true
            lastErrors = result.errors
            if (attemptIndex < MAX_ATTEMPTS) {
              publisher.publish(jobId, JobPhase.RETRY_PROMPT, attempt = attemptIndex)
              retryCount++
            }
          }
        }
      }

      throw IllegalStateException(
        "Narrative LLM did not produce a valid response after $MAX_ATTEMPTS attempts. " +
          "Last errors: ${lastErrors?.joinToString("; ")}"
      )
    } finally {
      // `finally` so the failure path still emits a score row — that's the case where the flags
      // matter most. `toInt()` is safe : Int.MAX_VALUE / 1000 ≈ 24 days, well beyond any
      // realistic narrative run.
      val latencyMs = (System.currentTimeMillis() - startedAtMs).toInt()
      scoreRecorder.record(
        promptTemplate = prompt,
        snapshotId = savedSnapshotId,
        latencyMs = latencyMs,
        retryCount = retryCount,
        parseFailed = parseFailed,
        validatorFailed = validatorFailed,
      )
    }
  }

  private fun retryFeedback(errors: List<String>): String =
    """

YOUR PREVIOUS RESPONSE WAS REJECTED BY THE VALIDATOR. Errors:
${errors.joinToString("\n") { "- $it" }}
Fix every error above and respond again with valid JSON only. Do not repeat the same mistakes.
    """
      .trimIndent()

  companion object {
    private const val MAX_ATTEMPTS = 2 // initial + 1 retry on validator/parser failure
  }
}
