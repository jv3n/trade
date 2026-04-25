package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.Portfolio
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface PortfolioRepository : JpaRepository<Portfolio, UUID> {
  fun findByName(name: String): Portfolio?
}
