package com.portfolioai.portfolio.application

import com.portfolioai.portfolio.application.dto.AssetDto
import com.portfolioai.portfolio.application.dto.OwnedTickerDto
import com.portfolioai.portfolio.application.dto.PortfolioDto
import com.portfolioai.portfolio.application.dto.toDto
import com.portfolioai.portfolio.domain.AssetStatus
import com.portfolioai.portfolio.infrastructure.persistence.AssetRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import java.util.UUID
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class PortfolioQueryService(
  private val portfolioRepository: PortfolioRepository,
  private val assetRepository: AssetRepository,
) {

  fun findAll(): List<PortfolioDto> = portfolioRepository.findAll().map { it.toDto() }

  fun findById(id: UUID): PortfolioDto =
    portfolioRepository.findByIdOrNull(id)?.toDto()
      ?: throw NoSuchElementException("Portfolio $id not found")

  fun findAssets(portfolioId: UUID): List<AssetDto> {
    if (!portfolioRepository.existsById(portfolioId))
      throw NoSuchElementException("Portfolio $portfolioId not found")
    // OPEN-only — closed positions (CSV import V5 lifecycle) ne sont pas exposées au dashboard ;
    // elles vivent dans les snapshots historiques et la future page "Positions historiques".
    return assetRepository.findByPortfolioIdAndStatus(portfolioId, AssetStatus.OPEN).map {
      it.toDto()
    }
  }

  /**
   * Distinct tickers across all portfolios, alphabetically sorted, with the number of portfolios
   * holding each. Backs the dashboard sidebar's "Tickers détenus" navigation shortcut to the
   * dossier pages.
   */
  fun findOwnedTickers(): List<OwnedTickerDto> =
    assetRepository.findOwnedTickerRows().map {
      OwnedTickerDto(
        ticker = it.ticker,
        name = it.name,
        assetType = it.assetType,
        portfolioCount = it.portfolioCount.toInt(),
      )
    }
}
