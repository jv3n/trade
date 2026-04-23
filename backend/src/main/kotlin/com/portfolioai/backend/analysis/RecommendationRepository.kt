package com.portfolioai.backend.analysis

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface RecommendationRepository : JpaRepository<Recommendation, UUID> {

    @Query("SELECT r FROM Recommendation r LEFT JOIN FETCH r.actions WHERE r.portfolio.id = :portfolioId ORDER BY r.generatedAt DESC")
    fun findByPortfolioId(portfolioId: UUID): List<Recommendation>
}
