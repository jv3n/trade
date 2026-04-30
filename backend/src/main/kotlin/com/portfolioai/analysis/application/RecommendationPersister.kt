package com.portfolioai.analysis.application

import com.portfolioai.analysis.domain.Recommendation
import com.portfolioai.analysis.domain.RecommendationAction
import com.portfolioai.analysis.domain.RecommendationActionItem
import com.portfolioai.analysis.infrastructure.persistence.RecommendationRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import java.math.BigDecimal
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Persists a [ParsedLlmRecommendation] (already parsed and validated) as a [Recommendation] + its
 * actions. Runs in its own short transaction so that the long-running LLM call upstream doesn't
 * hold a DB connection.
 */
@Component
class RecommendationPersister(
  private val portfolioRepository: PortfolioRepository,
  private val recommendationRepository: RecommendationRepository,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Transactional
  fun persist(portfolioId: UUID, parsed: ParsedLlmRecommendation): Recommendation {
    val portfolio =
      portfolioRepository.findByIdOrNull(portfolioId)
        ?: throw NoSuchElementException("Portfolio $portfolioId not found")

    val recommendation =
      Recommendation(
        portfolio = portfolio,
        contextSummary = parsed.contextSummary,
        content = parsed.content,
        confidence = parsed.confidence?.toShort(),
      )

    parsed.actions.forEach { action ->
      recommendation.actions.add(
        RecommendationActionItem(
          recommendation = recommendation,
          ticker = action.ticker,
          action = RecommendationAction.valueOf(action.action),
          rationale = action.rationale,
          targetWeight = action.targetWeight?.let { BigDecimal(it.toString()) },
        )
      )
    }

    val saved = recommendationRepository.save(recommendation)
    log.info("Recommendation saved id={} actions={}", saved.id, saved.actions.size)
    return saved
  }
}
