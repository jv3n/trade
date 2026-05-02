package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import com.portfolioai.analysis.infrastructure.llm.LlmClient
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.TickerSnapshot
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Orchestrates one narrative generation run. Deliberately **not** `@Transactional` — the slow LLM
 * call must not hold a DB connection (legacy convention). The two surrounding DB phases live in
 * [TickerService] (loads market data — itself transactional only when needed) and
 * [TickerNarrativePersister].
 *
 * Mirrors [AnalysisExecutor]'s parse / validate / re-prompt loop : one initial call + at most one
 * retry with the validator's errors as feedback. If both attempts fail, throws — there's no
 * meaningful "fallback" for a free-form narrative.
 */
@Component
class TickerNarrativeExecutor(
  private val tickerService: TickerService,
  private val llmClient: LlmClient,
  private val parser: TickerNarrativeParser,
  private val validator: TickerNarrativeValidator,
  private val persister: TickerNarrativePersister,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun execute(symbol: String): TickerNarrativeSnapshot {
    val market: TickerSnapshot = tickerService.load(symbol)
    val indicators =
      market.indicators
        ?: throw IllegalStateException("No indicators computed for $symbol — series too short")

    val userMessage = buildNarrativeUserMessage(market.quote, indicators)

    var lastErrors: List<String>? = null
    repeat(MAX_ATTEMPTS) { attempt ->
      val message =
        if (lastErrors == null) userMessage else userMessage + retryFeedback(lastErrors!!)
      log.info(
        "Calling LLM for narrative symbol={} (attempt {}/{})",
        symbol,
        attempt + 1,
        MAX_ATTEMPTS,
      )
      val raw = llmClient.complete(NARRATIVE_SYSTEM_PROMPT, message, maxTokens = 600)
      log.debug("Raw narrative response (attempt {}): {}", attempt + 1, raw)

      val parsed =
        try {
          parser.parse(raw)
        } catch (e: Exception) {
          log.warn("Narrative attempt {} failed parsing: {}", attempt + 1, e.message)
          lastErrors = listOf("Your previous response was not valid JSON: ${e.message}")
          return@repeat
        }

      when (val result = validator.validate(parsed)) {
        NarrativeValidationResult.Valid -> {
          log.info("Narrative valid on attempt {} symbol={}", attempt + 1, symbol)
          return persister.persist(symbol, indicators, parsed, llmClient.modelId())
        }
        is NarrativeValidationResult.Invalid -> {
          log.warn("Narrative attempt {} failed validation: {}", attempt + 1, result.errors)
          lastErrors = result.errors
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
    private const val MAX_ATTEMPTS = 2 // initial + 1 retry, matches AnalysisExecutor
  }
}
