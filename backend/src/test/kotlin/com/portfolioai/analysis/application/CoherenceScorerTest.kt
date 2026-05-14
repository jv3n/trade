package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.domain.SentimentChange
import com.portfolioai.analysis.domain.Verdict
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Tests on [CoherenceScorer] — Phase 3 #2 heuristic that flags when a narrative changes in a way
 * the price action doesn't justify. The scorer is pure (no Spring container, no DB), so this is a
 * straight unit test.
 *
 * **Spec we want to pin** :
 *
 * - **Stable narrative + flat price → OK.** Same sentiment, identical key_points, same length — no
 *   excuse needed because there's nothing to excuse.
 * - **Sentiment flip + flat price → HIGH.** The strongest signal we measure ; the LLM reversed
 *   itself with no price action to back it.
 * - **Sentiment flip + 5 % price move → no longer HIGH.** The price excuse cuts the divergence
 *   roughly in half (50 % factor at PRICE_FULL_EXCUSE) — the verdict drops out of HIGH.
 * - **Disjoint key_points + same sentiment → at most WARN.** Writing variance is normal, not an
 *   alarm — the chip should never scream HIGH on key_points alone.
 * - **3× longer summary + everything else identical → at worst WARN.** Verbose is not contradictory
 *   ; length carries the smallest weight.
 * - **Edge cases** : empty key_points on both sides → jaccard = 1 ; previous price = 0 → priceMove
 *   = null (defensive, no excuse applied).
 * - **`SentimentChange` ladder** : `BULLISH ↔ BEARISH` flips, `NEUTRAL ↔ {BULLISH, BEARISH}` is
 *   one-step (PARTIAL), same-on-same is SAME.
 */
class CoherenceScorerTest {

  private val scorer = CoherenceScorer()

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `stable narrative on a flat tape lands on OK with sentiment SAME`() {
    val out =
      scorer.score(
        current = projection(sentiment = Sentiment.BULLISH, summary = "Calm post-earnings drift."),
        previous = projection(sentiment = Sentiment.BULLISH, summary = "Calm post-earnings drift."),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )

    assertEquals(Verdict.OK, out.verdict)
    assertEquals(SentimentChange.SAME, out.sentimentChange)
    assertEquals(bd("1.0000"), out.keyPointsJaccard, "identical key_points → full jaccard")
    assertEquals(bd("1.0000"), out.summaryLengthRatio, "identical summary length → ratio = 1")
    assertEquals(bd("0.0000"), out.priceMoveBetween)
  }

  // ---------------------------------------------------------------------- the headline scenario

  @Test
  fun `BULLISH→BEARISH flip on a flat tape is HIGH (the scorer's whole point)`() {
    // The single regression we're guarding against : the LLM reverses itself overnight when the
    // price barely moved. If this stops being HIGH, the chip on the timeline becomes useless.
    val out =
      scorer.score(
        current = projection(sentiment = Sentiment.BEARISH),
        previous = projection(sentiment = Sentiment.BULLISH),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )

    assertEquals(Verdict.HIGH, out.verdict)
    assertEquals(SentimentChange.FLIPPED, out.sentimentChange)
  }

  @Test
  fun `BULLISH→BEARISH flip after a 5 percent move is excused out of HIGH`() {
    // Same flip, but the price did its job — narrative shift becomes plausible. With everything
    // else identical (same key_points, same length), the 5 % move excuse fully covers the lone
    // sentiment divergence and lands on OK. The chip on the page reads « Consistent » with the
    // tooltip showing a -5 % price move so the user can audit the call.
    val out =
      scorer.score(
        current = projection(sentiment = Sentiment.BEARISH),
        previous = projection(sentiment = Sentiment.BULLISH),
        currentPrice = bd("95.00"),
        previousPrice = bd("100.00"),
      )

    assertEquals(Verdict.OK, out.verdict)
    assertEquals(SentimentChange.FLIPPED, out.sentimentChange)
    assertEquals(bd("-0.0500"), out.priceMoveBetween)
  }

  @Test
  fun `disjoint key_points alone (sentiment SAME, length close) tops out at WARN`() {
    // Writing variance is normal — different word choices for "RSI rolling over" shouldn't fire
    // a HIGH. If this turns red, the page becomes noisy on every prompt v2 → v3 swap.
    val out =
      scorer.score(
        current =
          projection(
            sentiment = Sentiment.NEUTRAL,
            keyPoints = listOf("rsi near midline", "drawdown 4 percent"),
          ),
        previous =
          projection(
            sentiment = Sentiment.NEUTRAL,
            keyPoints = listOf("ma200 crossed up", "low volatility"),
          ),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )

    assertEquals(Verdict.WARN, out.verdict)
    assertEquals(SentimentChange.SAME, out.sentimentChange)
    assertEquals(bd("0.0000"), out.keyPointsJaccard)
  }

  @Test
  fun `tripled summary length with everything else identical stays at most WARN`() {
    val short = "Short."
    val long = short.repeat(3) // length triples = ratio ~3 → length divergence capped at 1
    val out =
      scorer.score(
        current = projection(sentiment = Sentiment.BULLISH, summary = long),
        previous = projection(sentiment = Sentiment.BULLISH, summary = short),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )

    // Length carries the lowest weight (0.15) → 0.15 raw divergence with no price excuse → OK.
    // The point of the test : never HIGH on length alone, and the ratio is correctly reported.
    assertEquals(Verdict.OK, out.verdict)
    assertEquals(bd("3.0000"), out.summaryLengthRatio)
  }

  // ---------------------------------------------------------------------- sentiment ladder

  @Test
  fun `NEUTRAL to BULLISH is PARTIAL (one step on the ladder, not a flip)`() {
    val out =
      scorer.score(
        current = projection(sentiment = Sentiment.BULLISH),
        previous = projection(sentiment = Sentiment.NEUTRAL),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )
    assertEquals(SentimentChange.PARTIAL, out.sentimentChange)
  }

  @Test
  fun `BEARISH to NEUTRAL is also PARTIAL (one step in the other direction)`() {
    val out =
      scorer.score(
        current = projection(sentiment = Sentiment.NEUTRAL),
        previous = projection(sentiment = Sentiment.BEARISH),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )
    assertEquals(SentimentChange.PARTIAL, out.sentimentChange)
  }

  // ---------------------------------------------------------------------- key_points jaccard
  // edges

  @Test
  fun `empty key_points on both sides degrade gracefully to a full match`() {
    // Vacuously identical — neither narrative offered key points, so we can't say they diverged.
    val out =
      scorer.score(
        current = projection(keyPoints = emptyList()),
        previous = projection(keyPoints = emptyList()),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )
    assertEquals(bd("1.0000"), out.keyPointsJaccard)
  }

  @Test
  fun `key_points jaccard normalises case and trims whitespace`() {
    // Mistral 7B and Claude phrase the same idea slightly differently — we shouldn't double-count
    // "RSI 62" vs " rsi 62 " as two distinct points.
    val out =
      scorer.score(
        current = projection(keyPoints = listOf(" RSI 62 ", "MA200 reclaim")),
        previous = projection(keyPoints = listOf("rsi 62", "ma200 reclaim")),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )
    assertEquals(bd("1.0000"), out.keyPointsJaccard)
  }

  // ---------------------------------------------------------------------- defensive : zero
  // previous price

  @Test
  fun `priceMoveBetween is null when previous price is non-positive (no NaN)`() {
    // `price` is NUMERIC(18,4) NOT NULL so a 0 shouldn't happen — but if data corruption ever
    // landed one, dividing by it would NaN the whole row and break the timeline rendering.
    val out =
      scorer.score(
        current = projection(),
        previous = projection(),
        currentPrice = bd("100.00"),
        previousPrice = BigDecimal.ZERO,
      )
    assertNull(out.priceMoveBetween)
  }

  // ---------------------------------------------------------------------- previous reference
  // round-trip

  @Test
  fun `previousSnapshotId and previousGeneratedAt are echoed back on the score`() {
    // The frontend uses these to render the tooltip "vs narrative from {{date}}" — pin that the
    // score carries them correctly so a refacto can't drop the field silently.
    val previousId = UUID.randomUUID()
    val previousAt = Instant.parse("2026-04-01T10:00:00Z")
    val out =
      scorer.score(
        current = projection(),
        previous = projection(snapshotId = previousId, generatedAt = previousAt),
        currentPrice = bd("100.00"),
        previousPrice = bd("100.00"),
      )
    assertEquals(previousId, out.previousSnapshotId)
    assertEquals(previousAt, out.previousGeneratedAt)
  }

  // ---------------------------------------------------------------------- fixtures

  private fun projection(
    snapshotId: UUID = UUID.randomUUID(),
    generatedAt: Instant = Instant.parse("2026-05-01T15:00:00Z"),
    sentiment: Sentiment = Sentiment.BULLISH,
    summary: String = "Price above MA200, RSI 62 — bullish posture.",
    keyPoints: List<String> = listOf("price above MA200", "RSI 62 mid-bullish"),
  ) =
    SnapshotProjection(
      snapshotId = snapshotId,
      generatedAt = generatedAt,
      sentiment = sentiment,
      summary = summary,
      keyPoints = keyPoints,
    )

  private fun bd(s: String): BigDecimal = BigDecimal(s).setScale(4)
}
