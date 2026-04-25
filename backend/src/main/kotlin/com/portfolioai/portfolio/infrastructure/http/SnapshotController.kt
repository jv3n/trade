package com.portfolioai.portfolio.infrastructure.http

import com.portfolioai.portfolio.application.dto.SnapshotPositionDto
import com.portfolioai.portfolio.application.dto.SnapshotSummaryDto
import com.portfolioai.portfolio.application.dto.toDto
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioSnapshotRepository
import com.portfolioai.portfolio.infrastructure.persistence.SnapshotPositionRepository
import java.util.UUID
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/snapshots")
class SnapshotController(
  private val snapshotRepository: PortfolioSnapshotRepository,
  private val positionRepository: SnapshotPositionRepository,
) {

  @GetMapping
  fun getAll(): List<SnapshotSummaryDto> =
    snapshotRepository.findAllWithPortfolio().map { snapshot ->
      val positions = positionRepository.findBySnapshotId(snapshot.id)
      SnapshotSummaryDto(
        id = snapshot.id,
        batchId = snapshot.batchId,
        portfolioId = snapshot.portfolio.id,
        portfolioName = snapshot.portfolio.name,
        importedAt = snapshot.importedAt,
        positionCount = positions.size,
        totalBookValueCad = positions.sumOf { it.bookValueCad },
      )
    }

  @GetMapping("/{id}/positions")
  fun getPositions(@PathVariable id: UUID): List<SnapshotPositionDto> =
    positionRepository.findBySnapshotId(id).map { it.toDto() }
}
