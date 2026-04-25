package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.Portfolio
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PortfolioRepository : JpaRepository<Portfolio, UUID> {
    fun findByName(name: String): Portfolio?
}
