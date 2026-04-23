package com.portfolioai.backend.portfolio

import com.portfolioai.backend.portfolio.dto.*
import org.springframework.data.repository.findByIdOrNull
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
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

    @Transactional
    fun create(request: CreatePortfolioRequest): PortfolioDto {
        val portfolio = Portfolio(name = request.name, description = request.description)
        return portfolioRepository.save(portfolio).toDto()
    }

    @Transactional
    fun delete(id: UUID) {
        if (!portfolioRepository.existsById(id)) throw NoSuchElementException("Portfolio $id not found")
        portfolioRepository.deleteById(id)
    }

    fun findAssets(portfolioId: UUID): List<AssetDto> {
        if (!portfolioRepository.existsById(portfolioId)) throw NoSuchElementException("Portfolio $portfolioId not found")
        return assetRepository.findByPortfolioId(portfolioId).map { it.toDto() }
    }

    @Transactional
    fun addAsset(portfolioId: UUID, request: CreateAssetRequest): AssetDto {
        val portfolio = portfolioRepository.findByIdOrNull(portfolioId)
            ?: throw NoSuchElementException("Portfolio $portfolioId not found")
        val asset = Asset(
            portfolio = portfolio,
            ticker = request.ticker.uppercase(),
            name = request.name,
            quantity = request.quantity,
            avgBuyPrice = request.avgBuyPrice,
            assetType = request.assetType
        )
        portfolio.updatedAt = Instant.now()
        return assetRepository.save(asset).toDto()
    }

    @Transactional
    fun removeAsset(portfolioId: UUID, assetId: UUID) {
        val asset = assetRepository.findByIdOrNull(assetId)
            ?: throw NoSuchElementException("Asset $assetId not found")
        if (asset.portfolio.id != portfolioId) throw IllegalArgumentException("Asset $assetId does not belong to portfolio $portfolioId")
        assetRepository.delete(asset)
    }
}
