package com.portfolioai.backend.portfolio

import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class SnapshotSummaryDto(
    val id: UUID,
    val batchId: UUID,
    val portfolioId: UUID,
    val portfolioName: String,
    val importedAt: Instant,
    val positionCount: Int,
    val totalBookValueCad: BigDecimal
)

data class SnapshotPositionDto(
    val ticker: String,
    val name: String,
    val assetType: String,
    val quantity: BigDecimal,
    val bookValueCad: BigDecimal,
    val marketValue: BigDecimal,
    val marketCurrency: String,
    val unrealizedGain: BigDecimal?,
    val gainCurrency: String?
)

@RestController
@RequestMapping("/api/snapshots")
class SnapshotController(
    private val snapshotRepository: PortfolioSnapshotRepository,
    private val positionRepository: SnapshotPositionRepository
) {

    @GetMapping
    fun getAll(): List<SnapshotSummaryDto> =
        snapshotRepository.findAllWithPortfolio().map { it.toSummary() }

    @GetMapping("/{id}/positions")
    fun getPositions(@PathVariable id: UUID): List<SnapshotPositionDto> =
        positionRepository.findBySnapshotId(id).map { it.toDto() }

    private fun PortfolioSnapshot.toSummary(): SnapshotSummaryDto {
        val positions = positionRepository.findBySnapshotId(id)
        return SnapshotSummaryDto(
            id = id,
            batchId = batchId,
            portfolioId = portfolio.id,
            portfolioName = portfolio.name,
            importedAt = importedAt,
            positionCount = positions.size,
            totalBookValueCad = positions.sumOf { it.bookValueCad }
        )
    }

    private fun SnapshotPosition.toDto() = SnapshotPositionDto(
        ticker = ticker,
        name = name,
        assetType = assetType.name,
        quantity = quantity,
        bookValueCad = bookValueCad,
        marketValue = marketValue,
        marketCurrency = marketCurrency,
        unrealizedGain = unrealizedGain,
        gainCurrency = gainCurrency
    )
}
