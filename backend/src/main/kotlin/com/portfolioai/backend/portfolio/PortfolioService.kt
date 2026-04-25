package com.portfolioai.backend.portfolio

import com.portfolioai.backend.portfolio.dto.AssetDto
import com.portfolioai.backend.portfolio.dto.PortfolioDto
import com.portfolioai.backend.portfolio.dto.toDto
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional(readOnly = true)
class PortfolioService(
    private val portfolioRepository: PortfolioRepository,
    private val assetRepository: AssetRepository
) {

    fun findAll(): List<PortfolioDto> =
        portfolioRepository.findAll().map { it.toDto() }

    fun findById(id: UUID): PortfolioDto =
        portfolioRepository.findByIdOrNull(id)?.toDto()
            ?: throw NoSuchElementException("Portfolio $id not found")

    fun findAssets(portfolioId: UUID): List<AssetDto> {
        if (!portfolioRepository.existsById(portfolioId)) throw NoSuchElementException("Portfolio $portfolioId not found")
        return assetRepository.findByPortfolioId(portfolioId).map { it.toDto() }
    }
}
