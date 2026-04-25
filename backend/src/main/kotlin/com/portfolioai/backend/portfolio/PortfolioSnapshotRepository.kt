package com.portfolioai.backend.portfolio

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface PortfolioSnapshotRepository : JpaRepository<PortfolioSnapshot, UUID> {

    /** Tous les snapshots triés par date DESC, avec leur portfolio chargé */
    @Query("SELECT s FROM PortfolioSnapshot s JOIN FETCH s.portfolio ORDER BY s.importedAt DESC")
    fun findAllWithPortfolio(): List<PortfolioSnapshot>
}

interface SnapshotPositionRepository : JpaRepository<SnapshotPosition, UUID> {
    fun findBySnapshotId(snapshotId: UUID): List<SnapshotPosition>
}
