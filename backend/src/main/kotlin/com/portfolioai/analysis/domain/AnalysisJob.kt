package com.portfolioai.analysis.domain

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

enum class JobStatus {
  PENDING,
  DONE,
  ERROR,
}

@Entity
@Table(name = "analysis_job")
class AnalysisJob(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(name = "portfolio_id", nullable = false) val portfolioId: UUID,
  @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  var status: JobStatus = JobStatus.PENDING,
  @Column(name = "recommendation_id") var recommendationId: UUID? = null,
  @Column(columnDefinition = "text") var error: String? = null,
)
