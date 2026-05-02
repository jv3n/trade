package com.portfolioai.analysis.application

import org.springframework.stereotype.Component

sealed interface NarrativeValidationResult {
  data object Valid : NarrativeValidationResult

  data class Invalid(val errors: List<String>) : NarrativeValidationResult
}

/**
 * Post-parse validation of the narrative LLM output. Catches the cases the schema-level parser
 * doesn't : empty summary, too few/many key points, key points padded with whitespace.
 *
 * Kept separate from [TickerNarrativeParser] so the executor can re-prompt with a precise list of
 * what's wrong (the legacy pattern : parse fails → "your response was not valid JSON" ; validation
 * fails → enumerated rule violations).
 */
@Component
class TickerNarrativeValidator {

  fun validate(parsed: ParsedNarrative): NarrativeValidationResult {
    val errors = mutableListOf<String>()
    if (parsed.summary.isBlank()) errors += "summary must not be empty"
    val sentenceCount = parsed.summary.count { it == '.' || it == '!' || it == '?' }
    if (sentenceCount > 4) {
      errors += "summary should be 2-3 sentences (got $sentenceCount sentence terminators)"
    }
    if (parsed.keyPoints.size < MIN_KEY_POINTS) {
      errors += "keyPoints must have at least $MIN_KEY_POINTS entries, got ${parsed.keyPoints.size}"
    }
    if (parsed.keyPoints.size > MAX_KEY_POINTS) {
      errors += "keyPoints must have at most $MAX_KEY_POINTS entries, got ${parsed.keyPoints.size}"
    }
    parsed.keyPoints.forEachIndexed { i, point ->
      if (point.isBlank()) errors += "keyPoints[$i] must not be empty"
      val wordCount = point.split(Regex("\\s+")).count { it.isNotBlank() }
      if (wordCount > MAX_WORDS_PER_POINT) {
        errors += "keyPoints[$i] should be ≤ $MAX_WORDS_PER_POINT words, got $wordCount: '$point'"
      }
    }
    return if (errors.isEmpty()) NarrativeValidationResult.Valid
    else NarrativeValidationResult.Invalid(errors)
  }

  companion object {
    private const val MIN_KEY_POINTS = 3
    private const val MAX_KEY_POINTS = 5
    private const val MAX_WORDS_PER_POINT = 15
  }
}
