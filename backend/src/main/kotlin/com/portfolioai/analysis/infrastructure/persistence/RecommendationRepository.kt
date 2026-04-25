package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.Recommendation
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface RecommendationRepository : JpaRepository<Recommendation, UUID> {

  @Query(
    "SELECT r FROM Recommendation r LEFT JOIN FETCH r.actions JOIN FETCH r.portfolio WHERE r.portfolio.id = :portfolioId ORDER BY r.generatedAt DESC"
  )
  fun findByPortfolioId(portfolioId: UUID): List<Recommendation>

  @Query(
    "SELECT r FROM Recommendation r LEFT JOIN FETCH r.actions JOIN FETCH r.portfolio ORDER BY r.generatedAt DESC"
  )
  fun findAllOrderByGeneratedAtDesc(): List<Recommendation>
}
