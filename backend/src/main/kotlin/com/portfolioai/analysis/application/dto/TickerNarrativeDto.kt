package com.portfolioai.analysis.application.dto

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.portfolioai.analysis.domain.JobStatus
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.analysis.domain.TickerNarrativeJob
import com.portfolioai.analysis.domain.TickerNarrativeSnapshot
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class TickerNarrativeJobDto(
  val jobId: UUID,
  val symbol: String,
  val status: JobStatus,
  val createdAt: Instant,
  val snapshotId: UUID? = null,
  val error: String? = null,
)

data class TickerNarrativeSnapshotDto(
  val id: UUID,
  val symbol: String,
  val generatedAt: Instant,
  val price: BigDecimal,
  val summary: String,
  val sentiment: Sentiment,
  val keyPoints: List<String>,
  val modelUsed: String,
  val promptVersion: String,
)

private val mapper = jacksonObjectMapper()

fun TickerNarrativeJob.toDto() =
  TickerNarrativeJobDto(
    jobId = id,
    symbol = symbol,
    status = status,
    createdAt = createdAt,
    snapshotId = snapshotId,
    error = error,
  )

fun TickerNarrativeSnapshot.toDto(): TickerNarrativeSnapshotDto {
  val keyPoints: List<String> = mapper.readValue(keyPointsJson, Array<String>::class.java).toList()
  return TickerNarrativeSnapshotDto(
    id = id,
    symbol = symbol,
    generatedAt = generatedAt,
    price = price,
    summary = summary,
    sentiment = sentiment,
    keyPoints = keyPoints,
    modelUsed = modelUsed,
    promptVersion = promptVersion,
  )
}
