package com.portfolioai.analysis.domain

import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Phase 3 #2 — coherence score between two adjacent narrative snapshots of the same ticker.
 *
 * A "warning" here means the narrative changed in a way that's **not justified by what happened to
 * the price** between the two runs. The LLM is a writer, not a decider (cf. CLAUDE.md) — its
 * sentiment + key_points should stay roughly stable when the price stayed roughly stable. A
 * BULLISH→BEARISH flip on a flat tape is a flag ; the same flip after a -10 % move is normal.
 *
 * The verdict is deliberately **heuristic** (no LLM-as-judge call) so the score is cheap,
 * transparent, and reproducible — the user can read each sub-measure and judge for themselves
 * whether the verdict is fair.
 *
 * - [SAME] sentiment + identical key_points + same length → OK regardless of price.
 * - [FLIPPED] sentiment + tiny price move → HIGH (the LLM reversed itself for no apparent reason).
 * - Length 3× the previous run + identical sentiment → at most WARN (the writing is verbose, not
 *   contradictory).
 */
data class CoherenceScore(
  val verdict: Verdict,
  val sentimentChange: SentimentChange,
  /**
   * Jaccard similarity on normalised key_points sets, in [0..1]. 1 = identical sets, 0 = disjoint.
   */
  val keyPointsJaccard: BigDecimal,
  /**
   * `current.summary.length / previous.summary.length`. 1 = same length ; > 1 = current is longer ;
   * < 1 = current is shorter. Capped at 9.99 so a freak 100× outlier doesn't wreck the row's JSON
   * size.
   */
  val summaryLengthRatio: BigDecimal,
  /**
   * Fractional price move between the two snapshots (`(current.price − previous.price) /
   * previous`), e.g. `0.0234` = +2.34 %. The sub-measure that justifies — or doesn't — a divergent
   * narrative. `null` only when [previousPrice] is non-positive, which shouldn't happen in
   * practice.
   */
  val priceMoveBetween: BigDecimal?,
  val previousSnapshotId: UUID,
  val previousGeneratedAt: Instant,
)

enum class Verdict {
  /** Narrative is stable, or its divergence is fully explained by the price move. */
  OK,
  /** Some divergence not fully justified by the price action — worth a glance, not an alarm. */
  WARN,
  /** The narrative reversed itself with no price move to back it — the user should look. */
  HIGH,
}

enum class SentimentChange {
  /** Both runs landed on the same sentiment. */
  SAME,
  /** One step on the BULLISH ↔ NEUTRAL ↔ BEARISH ladder (e.g. NEUTRAL → BULLISH). */
  PARTIAL,
  /** Full flip across NEUTRAL (BULLISH ↔ BEARISH). The strongest single signal we measure. */
  FLIPPED,
}
