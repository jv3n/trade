package com.portfolioai.portfolio.application

import com.portfolioai.portfolio.application.dto.AssetDto
import com.portfolioai.portfolio.application.dto.PortfolioDto
import com.portfolioai.portfolio.application.dto.toDto
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
    return assetRepository.findByPortfolioId(portfolioId).map { it.toDto() }
  }
}
