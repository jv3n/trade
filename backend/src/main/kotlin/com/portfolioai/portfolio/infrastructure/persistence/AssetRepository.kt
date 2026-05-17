package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.Asset
import com.portfolioai.portfolio.domain.AssetStatus
import com.portfolioai.portfolio.domain.AssetType
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

/**
 * Aggregate row used by [AssetRepository.findOwnedTickerRows]. Mapped via JPQL `new` constructor so
 * we don't fetch full entities just to count rows — pure SQL aggregation pushed to the DB. The
 * [assetType] field is included in the GROUP BY because for any given ticker the type is constant
 * across all rows (Wealthsimple is consistent on this) ; if a CSV import ever produced inconsistent
 * types for the same symbol, the user would simply see one row per (ticker, type) pair — surfaces
 * the discrepancy rather than silently picking one.
 */
data class OwnedTickerRow(
  val ticker: String,
  val name: String,
  val assetType: AssetType,
  val portfolioCount: Long,
)

interface AssetRepository : JpaRepository<Asset, UUID> {
  /**
   * Every asset row for a portfolio, OPEN and CLOSED. Used by the CSV import to compute the diff
   * between the previous state and the new CSV — the importer needs to see CLOSED rows so it can
   * **reopen** them when a previously-sold ticker comes back.
   */
  fun findByPortfolioId(portfolioId: UUID): List<Asset>

  /**
   * Currently held positions only — what the dashboard and owned-tickers views display. Filters out
   * rows whose status went `CLOSED` (position soldée, lifecycle introduced in V5).
   */
  fun findByPortfolioIdAndStatus(portfolioId: UUID, status: AssetStatus): List<Asset>

  /**
   * One row per distinct ticker across every portfolio, **OPEN positions only**. `portfolioCount`
   * is the number of portfolios currently holding that symbol. Aggregated server-side to avoid the
   * front loading every asset of every portfolio just to dedupe — keeps the dashboard sidebar
   * lookup O(distinct tickers) instead of O(positions). Closed positions are excluded by design ;
   * they belong to the future "Positions historiques" view, not the live dashboard.
   */
  @Query(
    """
    SELECT new com.portfolioai.portfolio.infrastructure.persistence.OwnedTickerRow(
      a.ticker, MAX(a.name), a.assetType, COUNT(DISTINCT a.portfolio.id)
    )
    FROM Asset a
    WHERE a.status = com.portfolioai.portfolio.domain.AssetStatus.OPEN
      AND a.portfolio.user.id = :userId
    GROUP BY a.ticker, a.assetType
    ORDER BY a.ticker ASC
  """
  )
  fun findOwnedTickerRows(@Param("userId") userId: UUID): List<OwnedTickerRow>
}
