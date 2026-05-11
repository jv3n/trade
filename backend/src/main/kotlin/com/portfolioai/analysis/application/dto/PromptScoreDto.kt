package com.portfolioai.analysis.application.dto

import com.portfolioai.analysis.domain.PromptScore
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Wire shape of one `prompt_score` row. Returned today by the Phase 3 PR5 thumbs PATCH endpoint so
 * the frontend can confirm the persisted `userThumbs` value (the optimistic flip + roll-back UX
 * needs to know whether the server actually accepted the write). PR6 will reuse this shape for the
 * stats endpoint that returns one row per snapshot when the user opens a per-prompt detail page.
 *
 * `snapshotId` and `userThumbs` are the fields the page consumes today ; the rest is forward compat
 * (PR6 needs `latencyMs` / `retryCount` / `parseFailed` / `validatorFailed` for the aggregation,
 * but rendering them per row keeps the API surface honest about what's persisted).
 */
data class PromptScoreDto(
  val id: UUID,
  val snapshotId: UUID?,
  val promptTemplateId: UUID,
  val latencyMs: Int,
  val retryCount: Int,
  val parseFailed: Boolean,
  val validatorFailed: Boolean,
  val userThumbs: Short,
  val llmJudgeScore: BigDecimal?,
  val createdAt: Instant,
)

fun PromptScore.toDto(): PromptScoreDto =
  PromptScoreDto(
    id = id,
    snapshotId = snapshotId,
    promptTemplateId = promptTemplateId,
    latencyMs = latencyMs,
    retryCount = retryCount,
    parseFailed = parseFailed,
    validatorFailed = validatorFailed,
    userThumbs = userThumbs,
    llmJudgeScore = llmJudgeScore,
    createdAt = createdAt,
  )

/**
 * Request body of `PATCH /api/narrative/snapshots/{snapshotId}/thumbs`. The shape carries a single
 * `value` field (-1, 0, +1) — kept as a wrapper rather than a raw int in the URL to leave room for
 * future fields (e.g. an optional `comment` for free-text feedback).
 */
data class ThumbsRequest(val value: Short)
