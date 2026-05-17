package com.portfolioai.portfolio.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.portfolio.application.dto.AssetDto
import com.portfolioai.portfolio.application.dto.OwnedTickerDto
import com.portfolioai.portfolio.application.dto.PortfolioDto
import com.portfolioai.portfolio.application.dto.toDto
import com.portfolioai.portfolio.domain.AssetStatus
import com.portfolioai.portfolio.infrastructure.persistence.AssetRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Read-side queries scoped to the **currently authenticated user**. Every method reads
 * `authService.getCurrentUser().id` and filters on `portfolio.user_id` so a brute-force on UUIDs
 * from another user's session can't leak data — even if the SPA accidentally hits `GET
 * /api/portfolios/{otherUserPortfolioId}/assets`, the ownership predicate yields
 * `NoSuchElementException` → HTTP 404, identical to "doesn't exist".
 */
@Service
@Transactional(readOnly = true)
class PortfolioQueryService(
  private val portfolioRepository: PortfolioRepository,
  private val assetRepository: AssetRepository,
  private val authService: AuthService,
) {

  fun findAll(): List<PortfolioDto> =
    portfolioRepository.findAllByUserId(authService.getCurrentUser().id).map { it.toDto() }

  fun findById(id: UUID): PortfolioDto =
    portfolioRepository.findByIdAndUserId(id, authService.getCurrentUser().id)?.toDto()
      ?: throw NoSuchElementException("Portfolio $id not found")

  fun findAssets(portfolioId: UUID): List<AssetDto> {
    if (!portfolioRepository.existsByIdAndUserId(portfolioId, authService.getCurrentUser().id))
      throw NoSuchElementException("Portfolio $portfolioId not found")
    // OPEN-only — closed positions (CSV import V5 lifecycle) ne sont pas exposées au dashboard ;
    // elles vivent dans les snapshots historiques et la future page "Positions historiques".
    return assetRepository.findByPortfolioIdAndStatus(portfolioId, AssetStatus.OPEN).map {
      it.toDto()
    }
  }

  /**
   * Distinct tickers across the **current user's** portfolios, alphabetically sorted, with the
   * number of portfolios holding each. Backs the dashboard sidebar's "Tickers détenus" navigation
   * shortcut.
   */
  fun findOwnedTickers(): List<OwnedTickerDto> =
    assetRepository.findOwnedTickerRows(authService.getCurrentUser().id).map {
      OwnedTickerDto(
        ticker = it.ticker,
        name = it.name,
        assetType = it.assetType,
        portfolioCount = it.portfolioCount.toInt(),
      )
    }
}
