package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.Sentiment
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Validator unit tests. The validator is the second line of defence after the parser : the parser
 * checks the *shape* (is this a valid `{summary, sentiment, keyPoints}` object?), the validator
 * checks the *content* (are the strings non-empty? are there 3 to 5 key points? does each fit in
 * one line of UI?).
 *
 * Why these specific thresholds :
 * - `3-5 keyPoints` : fewer than 3 reads as "the LLM didn't try" ; more than 5 visually overflows
 *   the dossier card and stops being a tight summary.
 * - `≤ 15 words / bullet` : keeps each point one-liner-friendly. Past that the LLM is writing a
 *   sentence, not a takeaway, and the UI breaks layout.
 * - `≤ 100 sentences in summary` : the prompt asks for a thorough 5-12 sentence summary ; the
 *   100-sentence guardrail is pure runaway protection (truly pathological output would already be
 *   cut off by `max_tokens=600` on the LLM call). Anything below stays untouched so cosmetic
 *   verbosity never triggers a retry.
 *
 * Each rejection asserts the *error message* contains a recognisable substring — that error string
 * is what the executor feeds back to the LLM during the retry, so its phrasing matters.
 */
class TickerNarrativeValidatorTest {

  private val validator = TickerNarrativeValidator()

  /** Happy-default narrative ; tests override only the field they're exercising. */
  private fun parsed(
    summary: String = "Price above MA200 with rising momentum. RSI in healthy range.",
    sentiment: Sentiment = Sentiment.BULLISH,
    keyPoints: List<String> = listOf("Price above MA200", "RSI at 62", "30-day momentum +5%"),
  ) = ParsedNarrative(summary, sentiment, keyPoints)

  /**
   * Asserts the validator rejected [parsed] with at least one error matching [errorSubstring]. The
   * substring is what the LLM will see in the retry feedback, so we want each rule to surface a
   * recognisable hint.
   */
  private fun assertRejectedWith(parsed: ParsedNarrative, errorSubstring: String) {
    val result = validator.validate(parsed)
    assertTrue(result is NarrativeValidationResult.Invalid, "expected Invalid, got $result")
    val errors = (result as NarrativeValidationResult.Invalid).errors
    assertTrue(
      errors.any { errorSubstring in it },
      "expected an error containing '$errorSubstring' ; got ${errors}",
    )
  }

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  @Test
  fun `valid narrative passes`() {
    assertEquals(NarrativeValidationResult.Valid, validator.validate(parsed()))
  }

  // ---------------------------------------------------------------------------
  // Content rules
  // ---------------------------------------------------------------------------

  @Test
  fun `rejects empty summary`() {
    // Whitespace-only counts as empty — the LLM has occasionally returned " " when it was unsure.
    assertRejectedWith(parsed(summary = "   "), errorSubstring = "summary")
  }

  @Test
  fun `rejects fewer than 3 key points`() {
    assertRejectedWith(
      parsed(keyPoints = listOf("Above MA200", "RSI 62")),
      errorSubstring = "at least 3",
    )
  }

  @Test
  fun `rejects more than 5 key points`() {
    val tooMany = listOf("p1", "p2", "p3", "p4", "p5", "p6")
    assertRejectedWith(parsed(keyPoints = tooMany), errorSubstring = "at most 5")
  }

  @Test
  fun `rejects too-long key points`() {
    // Real failure mode : Mistral 7B sometimes turns a bullet into a full sentence.
    val verbose =
      "this is a very lengthy bullet point that definitely runs past fifteen words and so on"
    assertRejectedWith(
      parsed(keyPoints = listOf(verbose, "RSI 62", "30d +5%")),
      errorSubstring = "≤ 15 words",
    )
  }

  @Test
  fun `accepts a thorough multi-paragraph summary well past the conversational limit`() {
    // 15-sentence summary — the kind of thorough technical walk-through the prompt now asks for.
    // Used to fail at >4 then >10 ; loosened to >100 to make the validator a pure runaway
    // safety net rather than a length policy (the prompt does the length steering).
    val thorough = (1..15).joinToString(" ") { "Sentence $it." }
    assertEquals(NarrativeValidationResult.Valid, validator.validate(parsed(summary = thorough)))
  }

  @Test
  fun `rejects runaway summary past 100 sentences`() {
    // 101 terminators trips the guardrail — the paragraph-essay overflow case. In practice
    // `max_tokens=600` on the LLM call truncates well before this, so reaching the limit means
    // the model is genuinely misbehaving.
    val runaway = (1..101).joinToString(" ") { "S$it." }
    assertRejectedWith(parsed(summary = runaway), errorSubstring = "runaway-protection")
  }
}
