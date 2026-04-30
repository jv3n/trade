package com.portfolioai.analysis.application

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Parses the raw LLM JSON response into a domain-friendly [ParsedLlmRecommendation]. No validation
 * here — that's [RecommendationValidator]'s job. Tolerant of markdown fences and leading/trailing
 * prose around the JSON object.
 */
@Component
class LlmResponseParser(private val objectMapper: ObjectMapper) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun parse(rawResponse: String): ParsedLlmRecommendation {
    val json = extractJson(rawResponse)
    val raw =
      try {
        objectMapper.readValue(json, RawLlmResponse::class.java)
      } catch (e: Exception) {
        log.error("Failed to parse LLM response: {}", e.message)
        throw IllegalStateException("LLM returned an unexpected response format", e)
      }
    return ParsedLlmRecommendation(
      content = raw.content,
      confidence = raw.confidence,
      contextSummary = raw.contextSummary,
      actions =
        raw.actions.map {
          ParsedAction(
            ticker = it.ticker.uppercase(),
            action = it.action.uppercase(),
            rationale = it.rationale,
            targetWeight = it.targetWeight,
          )
        },
    )
  }

  private fun extractJson(raw: String): String {
    val stripped = raw.replace(Regex("```(?:json)?\\s*"), "").trim()
    val start = stripped.indexOf('{')
    val end = stripped.lastIndexOf('}')
    return if (start != -1 && end > start) stripped.substring(start, end + 1) else stripped
  }
}

/**
 * Detached, validated-or-not snapshot of what the LLM returned. All ticker / action strings are
 * upper-cased. Used by validator and persister.
 */
data class ParsedLlmRecommendation(
  val content: String,
  val confidence: Int?,
  val contextSummary: String,
  val actions: List<ParsedAction>,
) {
  /**
   * Last-resort sanitisation when validation has failed all retries. Strips actions on tickers not
   * in the portfolio (LLM hallucinations) and fills in HOLD entries for any portfolio ticker the
   * LLM forgot. The result still goes through `RecommendationPersister` which itself will reject
   * unknown enum action values.
   */
  fun withHoldFallback(allTickers: List<String>): ParsedLlmRecommendation {
    val portfolio = allTickers.map { it.uppercase() }.toSet()
    val cleaned = actions.filter { it.ticker.uppercase() in portfolio }
    val present = cleaned.map { it.ticker.uppercase() }.toSet()
    val missing = portfolio - present
    val filled =
      cleaned +
        missing.map {
          ParsedAction(
            ticker = it,
            action = "HOLD",
            rationale = "Auto-filled: LLM omitted this ticker",
            targetWeight = null,
          )
        }
    return copy(actions = filled)
  }
}

data class ParsedAction(
  val ticker: String,
  val action: String,
  val rationale: String?,
  val targetWeight: Double?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class RawLlmResponse(
  val content: String = "",
  val confidence: Int? = null,
  val contextSummary: String = "",
  val actions: List<RawLlmAction> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class RawLlmAction(
  val ticker: String = "",
  val action: String = "HOLD",
  val rationale: String? = null,
  val targetWeight: Double? = null,
)
