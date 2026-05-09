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
 */
@Component
class TickerNarrativeExecutor(
  private val tickerService: TickerService,
  private val llmClient: LlmClient,
  private val parser: TickerNarrativeParser,
  private val validator: TickerNarrativeValidator,
  private val persister: TickerNarrativePersister,
  private val publisher: JobEventPublisher,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun execute(symbol: String, jobId: UUID): TickerNarrativeSnapshot {
    publisher.publish(jobId, JobPhase.LOADING_CONTEXT)
    val market: TickerSnapshot = tickerService.load(symbol)
    val indicators =
      market.indicators
        ?: throw IllegalStateException("No indicators computed for $symbol — series too short")

    val userMessage = buildNarrativeUserMessage(market.quote, indicators)

    var lastErrors: List<String>? = null
    repeat(MAX_ATTEMPTS) { attempt ->
      val attemptIndex = attempt + 1
      val message =
        if (lastErrors == null) userMessage else userMessage + retryFeedback(lastErrors!!)
      log.info(
        "Calling LLM for narrative symbol={} (attempt {}/{})",
        symbol,
        attemptIndex,
        MAX_ATTEMPTS,
      )
      publisher.publish(jobId, JobPhase.CALLING_LLM, attempt = attemptIndex)
      val raw = llmClient.complete(NARRATIVE_SYSTEM_PROMPT, message, maxTokens = 600)
      publisher.publish(jobId, JobPhase.RECEIVED_RAW, attempt = attemptIndex)
      log.debug("Raw narrative response (attempt {}): {}", attemptIndex, raw)

      publisher.publish(jobId, JobPhase.PARSING, attempt = attemptIndex)
      val parsed =
        try {
          parser.parse(raw)
        } catch (e: Exception) {
          log.warn("Narrative attempt {} failed parsing: {}", attemptIndex, e.message)
          lastErrors = listOf("Your previous response was not valid JSON: ${e.message}")
          if (attemptIndex < MAX_ATTEMPTS) {
            publisher.publish(jobId, JobPhase.RETRY_PROMPT, attempt = attemptIndex)
          }
          return@repeat
        }

      publisher.publish(jobId, JobPhase.VALIDATING, attempt = attemptIndex)
      when (val result = validator.validate(parsed)) {
        NarrativeValidationResult.Valid -> {
          log.info("Narrative valid on attempt {} symbol={}", attemptIndex, symbol)
          publisher.publish(jobId, JobPhase.PERSISTING, attempt = attemptIndex)
          return persister.persist(symbol, indicators, parsed, llmClient.modelId())
        }
        is NarrativeValidationResult.Invalid -> {
          log.warn("Narrative attempt {} failed validation: {}", attemptIndex, result.errors)
          lastErrors = result.errors
          if (attemptIndex < MAX_ATTEMPTS) {
            publisher.publish(jobId, JobPhase.RETRY_PROMPT, attempt = attemptIndex)
          }
        }
      }
    }

    throw IllegalStateException(
      "Narrative LLM did not produce a valid response after $MAX_ATTEMPTS attempts. " +
        "Last errors: ${lastErrors?.joinToString("; ")}"
    )
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
