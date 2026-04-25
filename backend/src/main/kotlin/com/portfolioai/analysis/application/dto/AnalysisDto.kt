package com.portfolioai.analysis.application.dto

import com.portfolioai.analysis.domain.AnalysisJob
import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.Recommendation
import com.portfolioai.analysis.domain.RecommendationAction
import com.portfolioai.analysis.domain.RecommendationStatus
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class RecommendationActionDto(
  val ticker: String,
  val action: RecommendationAction,
  val rationale: String?,
  val targetWeight: BigDecimal?,
)

data class RecommendationDto(
  val id: UUID,
  val portfolioId: UUID,
  val portfolioName: String,
  val generatedAt: Instant,
  val contextSummary: String,
  val promptVersion: String,
  val content: String,
  val confidence: Short?,
  val status: RecommendationStatus,
  val actions: List<RecommendationActionDto>,
)

data class AnalysisJobDto(
  val jobId: UUID,
  val status: JobStatus,
  val recommendationId: UUID? = null,
  val error: String? = null,
)

fun Recommendation.toDto() =
  RecommendationDto(
    id = id,
    portfolioId = portfolio.id,
    portfolioName = portfolio.name,
    generatedAt = generatedAt,
    contextSummary = contextSummary,
    promptVersion = promptVersion,
    content = content,
    confidence = confidence,
    status = status,
    actions =
      actions.map { RecommendationActionDto(it.ticker, it.action, it.rationale, it.targetWeight) },
  )

fun AnalysisJob.toDto() =
  AnalysisJobDto(jobId = id, status = status, recommendationId = recommendationId, error = error)
