package com.portfolioai.analysis.domain

import com.portfolioai.portfolio.domain.Portfolio
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

enum class RecommendationStatus {
  PENDING,
  APPLIED,
  IGNORED,
  EVALUATED,
}

enum class RecommendationAction {
  BUY,
  SELL,
  HOLD,
  REDUCE,
}

@Entity
@Table(name = "recommendation")
class Recommendation(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "portfolio_id", nullable = false)
  val portfolio: Portfolio,
  @Column(name = "generated_at", nullable = false) val generatedAt: Instant = Instant.now(),
  @Column(name = "context_summary", nullable = false, columnDefinition = "text")
  val contextSummary: String,
  @Column(name = "prompt_version", nullable = false, length = 50) val promptVersion: String = "v1",
  @Column(nullable = false, columnDefinition = "text") val content: String,
  val confidence: Short?,
  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 30)
  var status: RecommendationStatus = RecommendationStatus.PENDING,
  @OneToMany(mappedBy = "recommendation", cascade = [CascadeType.ALL], orphanRemoval = true)
  val actions: MutableList<RecommendationActionItem> = mutableListOf(),
)

@Entity
@Table(name = "recommendation_action")
class RecommendationActionItem(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "recommendation_id", nullable = false)
  val recommendation: Recommendation,
  @Column(nullable = false, length = 20) val ticker: String,
  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  val action: RecommendationAction,
  @Column(columnDefinition = "text") val rationale: String?,
  @Column(name = "target_weight", precision = 5, scale = 2) val targetWeight: BigDecimal?,
)
