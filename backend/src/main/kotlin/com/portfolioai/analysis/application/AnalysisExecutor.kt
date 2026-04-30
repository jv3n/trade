package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.Recommendation
import com.portfolioai.analysis.infrastructure.llm.LlmClient
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Orchestrates a single analysis run. Deliberately **not** `@Transactional` — the slow
 * `llmClient.complete()` call must not hold a DB connection. The two surrounding DB phases are
 * isolated in [AnalysisContextLoader] and [RecommendationPersister].
 *
 * If the LLM produces JSON that fails [RecommendationValidator] (missing tickers, wrong sum,
 * inconsistent SELL/weight…), we re-prompt **once** with the validation errors as feedback. If the
 * second attempt is still invalid, we persist it anyway with HOLD fallbacks for any missing ticker
 * — better to have *something* than nothing, but we log loudly.
 */
@Component
class AnalysisExecutor(
  private val llmClient: LlmClient,
  private val contextLoader: AnalysisContextLoader,
  private val parser: LlmResponseParser,
  private val validator: RecommendationValidator,
  private val persister: RecommendationPersister,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun execute(portfolioId: UUID): Recommendation {
    val context = contextLoader.load(portfolioId)
    val tickers = context.tickers

    var lastParsed: ParsedLlmRecommendation? = null
    var lastErrors: List<String>? = null

    repeat(MAX_ATTEMPTS) { attempt ->
      val userMessage =
        if (lastErrors == null) context.userMessage
        else context.userMessage + retryFeedback(lastErrors!!)
      log.info(
        "Calling LLM for portfolio '{}' (attempt {}/{})",
        context.portfolioName,
        attempt + 1,
        MAX_ATTEMPTS,
      )
      val raw = llmClient.complete(SYSTEM_PROMPT, userMessage, maxTokens = 800)
      log.info("Raw LLM response (attempt {}): {}", attempt + 1, raw)

      val parsed =
        try {
          parser.parse(raw)
        } catch (e: Exception) {
          log.warn("Attempt {} failed parsing: {}", attempt + 1, e.message)
          lastErrors = listOf("Your previous response was not valid JSON: ${e.message}")
          return@repeat
        }
      lastParsed = parsed

      when (val result = validator.validate(parsed, tickers)) {
        ValidationResult.Valid -> {
          log.info("LLM response valid on attempt {}", attempt + 1)
          return persister.persist(context.portfolioId, parsed)
        }
        is ValidationResult.Invalid -> {
          log.warn("Attempt {} failed validation: {}", attempt + 1, result.errors)
          lastErrors = result.errors
        }
      }
    }

    if (lastParsed == null) {
      log.error(
        "All {} attempts failed parsing. Cannot persist anything. Last errors: {}",
        MAX_ATTEMPTS,
        lastErrors,
      )
      throw IllegalStateException("LLM did not return parseable JSON after $MAX_ATTEMPTS attempts")
    }

    log.error(
      "All {} attempts failed validation. Persisting last response with HOLD fallback. Errors: {}",
      MAX_ATTEMPTS,
      lastErrors,
    )
    val withFallback = lastParsed!!.withHoldFallback(tickers)
    return persister.persist(context.portfolioId, withFallback)
  }

  private fun retryFeedback(errors: List<String>): String =
    """

YOUR PREVIOUS RESPONSE WAS REJECTED BY THE VALIDATOR. Errors:
${errors.joinToString("\n") { "- $it" }}
Fix every error above and respond again with valid JSON only. Do not repeat the same mistakes.
    """
      .trimIndent()

  companion object {
    private const val MAX_ATTEMPTS = 2 // initial call + 1 retry
  }
}
