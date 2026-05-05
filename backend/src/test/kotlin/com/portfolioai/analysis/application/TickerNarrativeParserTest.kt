package com.portfolioai.analysis.application

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.analysis.domain.Sentiment
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Parser unit tests. Each case represents a real failure mode we've observed (or expect) from one
 * of our LLM providers — Claude is well-behaved, but local models like Mistral 7B Instruct often
 * pad their output with prose ("Sure! Here is the analysis:") or wrap the JSON in markdown fences.
 *
 * Two design intents the tests pin down :
 * - **Be lenient on shape** : prose padding, code fences and mixed-case sentiment all parse
 *   successfully. Rejecting them would force a re-prompt for cosmetic issues that don't affect the
 *   data.
 * - **Be strict on structure** : missing fields, unknown sentiment values, or non-string entries in
 *   `keyPoints` must throw. The error message is what the executor's retry feeds back to the LLM —
 *   its phrasing must point at the exact problem so the second attempt can fix it.
 */
class TickerNarrativeParserTest {

  private val parser = TickerNarrativeParser(jacksonObjectMapper())

  // ---------------------------------------------------------------------------
  // Tolerance — the LLM made a stylistic choice that doesn't break the data
  // ---------------------------------------------------------------------------

  @Test
  fun `parses a clean JSON object`() {
    val raw =
      """
      {
        "summary": "Price is above MA200 with positive momentum. RSI in healthy range.",
        "sentiment": "BULLISH",
        "keyPoints": ["Above MA200", "RSI 62", "30d +5%"]
      }
      """
        .trimIndent()

    val parsed = parser.parse(raw)
    assertEquals(Sentiment.BULLISH, parsed.sentiment)
    assertEquals(3, parsed.keyPoints.size)
    assertTrue(parsed.summary.startsWith("Price is above"))
  }

  @Test
  fun `tolerates prose around the JSON object`() {
    // Real local-model shape — pads with a friendly opener and a closing wave.
    val raw =
      """
      Sure! Here is the analysis:
      {
        "summary": "Neutral picture overall.",
        "sentiment": "NEUTRAL",
        "keyPoints": ["Range-bound", "RSI near 50", "Volume in line with avg"]
      }
      Hope this helps.
      """
        .trimIndent()

    val parsed = parser.parse(raw)
    assertEquals(Sentiment.NEUTRAL, parsed.sentiment)
  }

  @Test
  fun `tolerates markdown code fences`() {
    // Mistral 7B Instruct loves code fences regardless of how the prompt is phrased.
    val raw =
      """
      ```json
      {"summary": "Sample.", "sentiment": "BEARISH", "keyPoints": ["Below MA200", "RSI 35", "20% off high"]}
      ```
      """
        .trimIndent()

    val parsed = parser.parse(raw)
    assertEquals(Sentiment.BEARISH, parsed.sentiment)
  }

  @Test
  fun `accepts mixed-case sentiment`() {
    // Local models are inconsistent on capitalisation. Fixing case in code is cheaper than
    // reprompting the model.
    val raw = """{"summary": "ok.", "sentiment": "bullish", "keyPoints": ["a", "b", "c"]}"""
    assertEquals(Sentiment.BULLISH, parser.parse(raw).sentiment)
  }

  // ---------------------------------------------------------------------------
  // Rejection — the structure is broken ; the executor must retry with feedback
  // ---------------------------------------------------------------------------

  @Test
  fun `rejects missing summary`() {
    val raw = """{"sentiment": "BULLISH", "keyPoints": ["a", "b", "c"]}"""
    val ex = assertThrows<IllegalArgumentException> { parser.parse(raw) }
    // The error message becomes the LLM's retry feedback ; "summary" must appear so the model
    // knows which field to fix.
    assertTrue(ex.message!!.contains("summary"))
  }

  @Test
  fun `rejects unknown sentiment`() {
    val raw = """{"summary": "ok.", "sentiment": "EUPHORIC", "keyPoints": ["a", "b", "c"]}"""
    val ex = assertThrows<IllegalArgumentException> { parser.parse(raw) }
    // Listing the allowed values in the error gives the model a concrete fix on retry.
    assertTrue(ex.message!!.contains("BULLISH"))
  }

  @Test
  fun `rejects keyPoints with non-string entries`() {
    // Local models occasionally slip a number in : `["RSI 62", 35, "30d +5%"]`.
    val raw = """{"summary": "ok.", "sentiment": "NEUTRAL", "keyPoints": ["a", 42, "c"]}"""
    val ex = assertThrows<IllegalArgumentException> { parser.parse(raw) }
    assertTrue(ex.message!!.contains("keyPoints"))
  }

  @Test
  fun `rejects malformed JSON`() {
    val raw = "this is not json at all"
    assertThrows<IllegalArgumentException> { parser.parse(raw) }
  }
}
