package com.portfolioai.portfolio.infrastructure.persistence

import com.portfolioai.portfolio.domain.Asset
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

/**
 * Aggregate row used by [AssetRepository.findOwnedTickerRows]. Mapped via JPQL `new` constructor so
 * we don't fetch full entities just to count rows — pure SQL aggregation pushed to the DB.
 */
data class OwnedTickerRow(val ticker: String, val name: String, val portfolioCount: Long)

interface AssetRepository : JpaRepository<Asset, UUID> {
  fun findByPortfolioId(portfolioId: UUID): List<Asset>

  /**
   * One row per distinct ticker across every portfolio. `portfolioCount` is the number of
   * portfolios holding that symbol (= number of distinct `portfolio_id`). Aggregated server-side to
   * avoid the front loading every asset of every portfolio just to dedupe — keeps the dashboard
   * sidebar lookup O(distinct tickers) instead of O(positions).
   */
  @Query(
    """
    SELECT new com.portfolioai.portfolio.infrastructure.persistence.OwnedTickerRow(
      a.ticker, MAX(a.name), COUNT(DISTINCT a.portfolio.id)
    )
    FROM Asset a
    GROUP BY a.ticker
    ORDER BY a.ticker ASC
  """
  )
  fun findOwnedTickerRows(): List<OwnedTickerRow>
}
