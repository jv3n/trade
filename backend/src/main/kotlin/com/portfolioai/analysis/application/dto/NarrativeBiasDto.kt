package com.portfolioai.analysis.application.dto

import com.portfolioai.analysis.domain.Sentiment
import java.math.BigDecimal

/**
 * Phase 3 #3 — wire shape of the narrative bias dashboard. Four sections, each computed server-side
 * over the same filtered corpus (date range + prompt version). The page renders one card per
 * section ; the response carries the totals so the page can show « 47 narratifs analysés » without
 * re-counting client-side.
 */
data class NarrativeBiasResponse(
  /**
   * Number of snapshots that matched the filters and entered the aggregations. `0` when the corpus
   * is empty for the active filter — the page surfaces an « pas assez de données » empty state in
   * that case rather than rendering empty charts.
   */
  val snapshotsConsidered: Int,
  val sentimentDistribution: SentimentDistributionDto,
  val calibration: List<CalibrationBucketDto>,
  val topicCoverage: TopicCoverageDto,
  val thumbsDistribution: List<ThumbsBucketDto>,
)

/** Counts + percent per sentiment bucket plus an optional « bias suspected » flag. */
data class SentimentDistributionDto(
  val total: Int,
  val buckets: List<SentimentBucketDto>,
  /**
   * Set when one bucket dominates the distribution above [BIAS_THRESHOLD] (60 %). The page renders
   * a chip « biais suspecté : BULLISH 68 % » next to the chart. `null` means « no single bucket
   * dominates » — i.e. the LLM is reasonably balanced across sentiment categories. We only flag the
   * single biggest bucket ; surfacing every bucket above 60 % would never trigger more than once
   * (the percentages sum to 1).
   */
  val biasFlag: BiasFlagDto?,
)

/** One sentiment bar : sentiment + count + share of total in the window (`0..1` fraction). */
data class SentimentBucketDto(val sentiment: Sentiment, val count: Int, val percent: BigDecimal)

/** Bias flag annotation — the dominant bucket, the percent that triggered, and the threshold. */
data class BiasFlagDto(val sentiment: Sentiment, val percent: BigDecimal, val threshold: BigDecimal)

/**
 * Calibration of a sentiment bucket against subsequent price action. For each sentiment, the
 * average fractional delta at 1d / 1w / 1m horizons. A well-calibrated LLM has positive deltas on
 * BULLISH, negative on BEARISH, and roughly zero on NEUTRAL ; persistent inversions indicate a
 * bias.
 *
 * Each delta is `null` when no snapshot in the bucket had usable price-after data (window not
 * elapsed, or upstream chart fetch failed). The page renders a discreet « — » in that cell.
 *
 * [snapshotsWithDelta] is the count of snapshots that contributed to the average — surfaces « 32
 * narratifs BULLISH dont 28 ont du recul à 1 mois ». Helps the user judge how meaningful the
 * average is.
 */
data class CalibrationBucketDto(
  val sentiment: Sentiment,
  val snapshotsTotal: Int,
  val snapshotsWithDelta1d: Int,
  val snapshotsWithDelta1w: Int,
  val snapshotsWithDelta1m: Int,
  val avgDelta1d: BigDecimal?,
  val avgDelta1w: BigDecimal?,
  val avgDelta1m: BigDecimal?,
)

/**
 * Top-N topics extracted from the `key_points` of the filtered corpus. Each topic is a normalised
 * lowercased token (stopwords filtered, alpha-only, length ≥ 3) ; the count is « how many distinct
 * snapshots mentioned this token at least once » (not « how many occurrences » — a snapshot that
 * names "rsi" twice still counts as one).
 *
 * The page surfaces the top-N as pills with their % coverage of [snapshotsTotal] ; the inverse read
 * is « topics never mentioned » (the user knows what they expected to see).
 */
data class TopicCoverageDto(val snapshotsTotal: Int, val topics: List<TopicDto>)

/** One topic line : the token, count of snapshots mentioning it, fraction of [snapshotsTotal]. */
data class TopicDto(val topic: String, val count: Int, val percent: BigDecimal)

/**
 * Thumbs distribution for one sentiment bucket. The page renders these as a stacked horizontal bar
 * per sentiment (👍 green / neutral grey / 👎 red / no-vote outline). Lets the user spot user-side
 * bias (« je thumbs-up systématiquement les BULLISH ») as a counter-check to the LLM-side bias the
 * other three sections measure.
 */
data class ThumbsBucketDto(
  val sentiment: Sentiment,
  val thumbsUp: Int,
  val thumbsNeutral: Int,
  val thumbsDown: Int,
  /** Snapshots in this bucket with no `prompt_score` row (fallback path or pre-PR2 history). */
  val noVote: Int,
)
