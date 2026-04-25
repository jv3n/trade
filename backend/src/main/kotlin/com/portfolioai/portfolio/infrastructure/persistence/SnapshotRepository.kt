package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.PortfolioSnapshot
import com.portfolioai.portfolio.domain.SnapshotPosition
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface PortfolioSnapshotRepository : JpaRepository<PortfolioSnapshot, UUID> {

  @Query("SELECT s FROM PortfolioSnapshot s JOIN FETCH s.portfolio ORDER BY s.importedAt DESC")
  fun findAllWithPortfolio(): List<PortfolioSnapshot>
}

interface SnapshotPositionRepository : JpaRepository<SnapshotPosition, UUID> {
  fun findBySnapshotId(snapshotId: UUID): List<SnapshotPosition>
}
