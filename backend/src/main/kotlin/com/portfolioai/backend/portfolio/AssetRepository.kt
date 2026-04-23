package com.portfolioai.backend.portfolio

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface AssetRepository : JpaRepository<Asset, UUID> {
    fun findByPortfolioId(portfolioId: UUID): List<Asset>
}
