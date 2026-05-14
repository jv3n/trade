package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.CoherenceScore
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.domain.SentimentChange
import com.portfolioai.analysis.domain.Verdict
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.util.UUID
import kotlin.math.abs
import kotlin.math.min
import org.springframework.stereotype.Component

/**
 * Phase 3 #2 — pure-function scorer. No Spring dependencies beyond `@Component` (kept so the
 * service can `inject()` it ; nothing here actually reads from the container). Stateless, side-
 * effect-free, fully unit-tested.
 *
 * **Why heuristic over LLM-as-judge** : (a) cost — scoring 50 snapshots/symbol × N symbols would
 * dwarf the per-narrative cost ; (b) transparency — the user can read the three sub-measures
 * (sentiment / key_points / length) and re-derive the verdict by eye ; (c) determinism — two runs
 * over the same data produce the same score, which matters when the user is debugging the prompt.
 *
 * **Weights** (sentiment 0.55 / keypoints 0.30 / length 0.15) are pinned by the test
 * `CoherenceScorerTest` rather than tuneable config. They lean heavily on sentiment because that's
 * the most visible signal to the user reading the timeline ; key_points + length cover the
 * "subtler" drift cases.
 */
@Component
class CoherenceScorer {

  /**
   * Scores how much [current] differs from [previous]. Both must belong to the same ticker — the
   * caller guarantees that ; we don't re-validate here to keep the scorer cheap and dependency-
   * free.
   *
   * - [currentPrice] / [previousPrice] : the snapshot prices already persisted on each row. We ask
   *   for them explicitly rather than re-reading from market bars because the snapshot's own price
   *   is the honest baseline (it's what the LLM saw at generation time).
   */
  fun score(
    current: SnapshotProjection,
    previous: SnapshotProjection,
    currentPrice: BigDecimal,
    previousPrice: BigDecimal,
  ): CoherenceScore {
    val sentChange = sentimentChange(current.sentiment, previous.sentiment)
    val jaccard = jaccard(current.keyPoints, previous.keyPoints)
    val lengthRatio = lengthRatio(current.summary.length, previous.summary.length)
    val priceMove = priceMove(currentPrice, previousPrice)

    val sentimentDivergence =
      when (sentChange) {
        SentimentChange.SAME -> 0.0
        SentimentChange.PARTIAL -> 0.4
        SentimentChange.FLIPPED -> 1.0
      }
    val keypointsDivergence = (BigDecimal.ONE - jaccard).toDouble().coerceIn(0.0, 1.0)
    // Use |ratio − 1| capped at 1.0 ; "doubled" (ratio = 2) and "halved" (ratio = 0.5) both end up
    // ≥ 0.5. A cap at 1.0 means anything past 2× counts the same — past that point it's the
    // sentiment / key_points that decide.
    val lengthDivergence = min(abs(lengthRatio.toDouble() - 1.0), 1.0)

    val rawDivergence =
      WEIGHT_SENTIMENT * sentimentDivergence +
        WEIGHT_KEYPOINTS * keypointsDivergence +
        WEIGHT_LENGTH * lengthDivergence

    // Price move excuses divergence : a 5 % swing fully justifies whatever the LLM said next, a
    // 0 % move excuses nothing. Linear ramp in between.
    val priceExcuse =
      if (priceMove == null) 0.0 else min(priceMove.abs().toDouble() / PRICE_FULL_EXCUSE, 1.0)
    val adjusted = (rawDivergence - PRICE_EXCUSE_FACTOR * priceExcuse).coerceAtLeast(0.0)

    val verdict =
      when {
        adjusted >= THRESHOLD_HIGH -> Verdict.HIGH
        adjusted >= THRESHOLD_WARN -> Verdict.WARN
        else -> Verdict.OK
      }

    return CoherenceScore(
      verdict = verdict,
      sentimentChange = sentChange,
      keyPointsJaccard = jaccard,
      summaryLengthRatio = lengthRatio,
      priceMoveBetween = priceMove,
      previousSnapshotId = previous.snapshotId,
      previousGeneratedAt = previous.generatedAt,
    )
  }

  internal fun sentimentChange(current: Sentiment, previous: Sentiment): SentimentChange {
    if (current == previous) return SentimentChange.SAME
    val isFlip =
      (current == Sentiment.BULLISH && previous == Sentiment.BEARISH) ||
        (current == Sentiment.BEARISH && previous == Sentiment.BULLISH)
    return if (isFlip) SentimentChange.FLIPPED else SentimentChange.PARTIAL
  }

  /**
   * Jaccard similarity over normalised key_points sets — lowercased + trimmed + non-empty. Two
   * empty lists return 1.0 (vacuously identical) ; one empty + one non-empty returns 0.0.
   */
  internal fun jaccard(current: List<String>, previous: List<String>): BigDecimal {
    val a = current.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    val b = previous.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    if (a.isEmpty() && b.isEmpty()) return BigDecimal.ONE.setScale(SCALE)
    val union = a.union(b).size
    if (union == 0) return BigDecimal.ONE.setScale(SCALE)
    val intersection = a.intersect(b).size
    return BigDecimal(intersection).divide(BigDecimal(union), SCALE, RoundingMode.HALF_UP)
  }

  internal fun lengthRatio(current: Int, previous: Int): BigDecimal {
    // Cap to avoid degenerate ratios when one summary is empty (shouldn't happen — `summary` is
    // NOT NULL TEXT — but the parser could in theory produce a 1-char string).
    val safePrevious = previous.coerceAtLeast(1)
    val raw = BigDecimal(current).divide(BigDecimal(safePrevious), SCALE, RoundingMode.HALF_UP)
    val capped = raw.min(LENGTH_RATIO_CAP)
    return capped
  }

  /**
   * Fractional price move from [previous] to [current]. `null` when [previous] is non-positive
   * (defensive — `price` is `NUMERIC(18,4) NOT NULL` so a zero is data-corruption ; we'd rather
   * skip the excuse than NaN the row).
   */
  internal fun priceMove(current: BigDecimal, previous: BigDecimal): BigDecimal? {
    if (previous.signum() <= 0) return null
    return current.subtract(previous).divide(previous, SCALE, RoundingMode.HALF_UP)
  }

  companion object {
    private const val SCALE = 4
    private val LENGTH_RATIO_CAP = BigDecimal("9.99")

    // Divergence weights — tested values, see CoherenceScorerTest.
    private const val WEIGHT_SENTIMENT = 0.55
    private const val WEIGHT_KEYPOINTS = 0.30
    private const val WEIGHT_LENGTH = 0.15

    // Price move that fully excuses a narrative flip.
    private const val PRICE_FULL_EXCUSE = 0.05
    // Excuse can knock at most this much off the divergence (so even a 5 % move can't turn a
    // FLIPPED + zero-jaccard into OK — the LLM should still mention the move).
    private const val PRICE_EXCUSE_FACTOR = 0.5

    private const val THRESHOLD_HIGH = 0.55
    private const val THRESHOLD_WARN = 0.25
  }
}

/**
 * Minimal projection of a [com.portfolioai.analysis.domain.TickerNarrativeSnapshot] used by
 * [CoherenceScorer]. Decoupled from the JPA entity (and from the SQL row shape used by the
 * observability query) so the scorer can be unit-tested without standing up either.
 */
data class SnapshotProjection(
  val snapshotId: UUID,
  val generatedAt: Instant,
  val sentiment: Sentiment,
  val summary: String,
  val keyPoints: List<String>,
)
