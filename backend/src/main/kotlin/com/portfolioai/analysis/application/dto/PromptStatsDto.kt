package com.portfolioai.analysis.application.dto

import java.time.LocalDate
import java.util.UUID

/**
 * Aggregated stats for one `prompt_template` row — Phase 3 PR6. Backs the
 * `/settings/prompts/{id}/stats` page : KPI cards at the top (total runs, latency p50 / p95,
 * failure rates, thumbs balance), then a daily time-series for the sparklines below.
 *
 * **Empty contract** : when no `prompt_score` row exists for the prompt yet, every numeric field is
 * 0 / null and [daily] is empty. The frontend renders an empty state with a hint to wait for the
 * next narrative run, rather than crashing on a division by zero in a rate computation.
 */
data class PromptStatsDto(
  val promptTemplateId: UUID,
  val totalRuns: Int,
  /** Median latency over every run. Null when [totalRuns] is 0. */
  val latencyP50Ms: Int?,
  /** 95th percentile latency — captures the long tail (Ollama cold-start, retries). */
  val latencyP95Ms: Int?,
  /** Fraction of runs with at least one retry, in `[0, 1]`. 0 when [totalRuns] is 0. */
  val retryRate: Double,
  val parseFailedRate: Double,
  val validatorFailedRate: Double,
  val thumbs: ThumbsDistribution,
  /** Reverse-chronological daily buckets (most recent first). Capped at ~90 days in the query. */
  val daily: List<DailyBucket>,
)

/**
 * Distribution of [com.portfolioai.analysis.domain.PromptScore.userThumbs] values across every run
 * for the prompt. `up + down + neutral == totalRuns` since the DB CHECK constraint restricts the
 * value to `{-1, 0, 1}` and the column is NOT NULL.
 */
data class ThumbsDistribution(val up: Int, val down: Int, val neutral: Int)

/**
 * One day's worth of aggregates for a prompt. Used to build the sparklines : latency over time
 * + thumbs polarity (up vs down) over time. Days with no runs are omitted (the frontend treats
 *   missing days as gaps rather than zeros to avoid suggesting actual scoring activity).
 */
data class DailyBucket(
  val day: LocalDate,
  val runs: Int,
  val latencyP50Ms: Int?,
  val thumbsUp: Int,
  val thumbsDown: Int,
)
