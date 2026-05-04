package com.portfolioai.analysis.application

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.domain.Sentiment
import org.springframework.stereotype.Component

/** Parsed output of the narrative LLM, before validation. */
data class ParsedNarrative(
  val summary: String,
  val sentiment: Sentiment,
  val keyPoints: List<String>,
)

/**
 * Lenient JSON parser for the narrative LLM response. Tolerates :
 * - leading/trailing prose around the JSON object (some local models can't help themselves) ;
 * - markdown code fences (```json …```) for the same reason ;
 * - mixed-case sentiment values (uppercased before parsing).
 *
 * Throws [IllegalArgumentException] when the structure is unrecoverable. The executor catches this,
 * treats it like any validation failure and re-prompts with the error.
 */
@Component
class TickerNarrativeParser(private val mapper: ObjectMapper) {

  fun parse(raw: String): ParsedNarrative {
    val json = extractJsonObject(raw)
    val node: JsonNode =
      try {
        mapper.readTree(json)
      } catch (e: Exception) {
        // Pass `e` as the cause so the original Jackson error stays in the stacktrace — the
        // outer message is what surfaces to the user, the cause is what helps debugging.
        throw IllegalArgumentException("Response was not valid JSON: ${e.message}", e)
      }

    val summary =
      node["summary"]?.takeIf { it.isTextual }?.asText()?.trim()
        ?: throw IllegalArgumentException("Missing or non-string 'summary'")
    val sentimentRaw =
      node["sentiment"]?.takeIf { it.isTextual }?.asText()?.trim()
        ?: throw IllegalArgumentException("Missing or non-string 'sentiment'")
    val sentiment =
      runCatching { Sentiment.valueOf(sentimentRaw.uppercase()) }
        .getOrElse {
          throw IllegalArgumentException(
            "'sentiment' must be one of BULLISH|NEUTRAL|BEARISH, got '$sentimentRaw'"
          )
        }
    val keyPointsNode =
      node["keyPoints"]?.takeIf { it.isArray }
        ?: throw IllegalArgumentException("Missing or non-array 'keyPoints'")
    val keyPoints =
      keyPointsNode.map {
        if (!it.isTextual) {
          throw IllegalArgumentException("'keyPoints' must be an array of strings")
        }
        it.asText().trim()
      }

    return ParsedNarrative(summary, sentiment, keyPoints)
  }

  /**
   * Walk the raw string and return the first balanced `{…}` block, ignoring any prose before/after.
   * Returns the original string if no balanced object is found — let `readTree` produce the error.
   */
  private fun extractJsonObject(raw: String): String {
    val stripped = raw.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
    val start = stripped.indexOf('{')
    if (start < 0) return stripped
    var depth = 0
    var inString = false
    var escape = false
    for (i in start until stripped.length) {
      val c = stripped[i]
      if (escape) {
        escape = false
        continue
      }
      when {
        c == '\\' && inString -> escape = true
        c == '"' -> inString = !inString
        !inString && c == '{' -> depth++
        !inString && c == '}' -> {
          depth--
          if (depth == 0) return stripped.substring(start, i + 1)
        }
      }
    }
    return stripped
  }
}
