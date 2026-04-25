package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.Asset
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface AssetRepository : JpaRepository<Asset, UUID> {
  fun findByPortfolioId(portfolioId: UUID): List<Asset>
}
