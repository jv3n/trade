package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.PortfolioSnapshot
import com.portfolioai.portfolio.domain.SnapshotPosition
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

/**
 * `portfolio_snapshot` n'a **pas** de colonne `user_id` directe — la table hérite du scope via la
 * FK `portfolio_id` qui pointe sur `portfolio.user_id` (depuis V10 Phase 4). Les queries filtrent
 * donc via le JOIN sur portfolio.
 */
interface PortfolioSnapshotRepository : JpaRepository<PortfolioSnapshot, UUID> {

  @Query(
    """
    SELECT s FROM PortfolioSnapshot s
    JOIN FETCH s.portfolio p
    WHERE p.user.id = :userId
    ORDER BY s.importedAt DESC
  """
  )
  fun findAllWithPortfolioByUserId(@Param("userId") userId: UUID): List<PortfolioSnapshot>

  /** Vérifie qu'un snapshot existe ET appartient au user — utilisé pour les ownership checks. */
  fun existsByIdAndPortfolioUserId(id: UUID, userId: UUID): Boolean
}

interface SnapshotPositionRepository : JpaRepository<SnapshotPosition, UUID> {
  fun findBySnapshotId(snapshotId: UUID): List<SnapshotPosition>
}
