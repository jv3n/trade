package com.portfolioai.backend.portfolio

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PortfolioRepository : JpaRepository<Portfolio, UUID>
