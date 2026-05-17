package com.portfolioai.portfolio.infrastructure.http

import com.portfolioai.auth.application.AuthService
import com.portfolioai.portfolio.application.dto.SnapshotPositionDto
import com.portfolioai.portfolio.application.dto.SnapshotSummaryDto
import com.portfolioai.portfolio.application.dto.toDto
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioSnapshotRepository
import com.portfolioai.portfolio.infrastructure.persistence.SnapshotPositionRepository
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Snapshot",
  description = "Historical portfolio snapshots (one per CSV import) — backs the suivi page",
)
@RestController
@RequestMapping("/api/snapshots")
class SnapshotController(
  private val snapshotRepository: PortfolioSnapshotRepository,
  private val positionRepository: SnapshotPositionRepository,
  private val authService: AuthService,
) {

  @GetMapping
  fun getAll(): List<SnapshotSummaryDto> {
    val userId = authService.getCurrentUser().id
    return snapshotRepository.findAllWithPortfolioByUserId(userId).map { snapshot ->
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
  }

  @GetMapping("/{id}/positions")
  fun getPositions(@PathVariable id: UUID): List<SnapshotPositionDto> {
    // Ownership check via portfolio.user_id — empêche le brute-force d'UUIDs de snapshots
    // d'autres users. Sans ce check, un user authentifié pourrait énumérer les snapshots de tous
    // les autres users via un UUID guessing (vraisemblance pratique = 0, mais defense en
    // profondeur).
    val userId = authService.getCurrentUser().id
    if (!snapshotRepository.existsByIdAndPortfolioUserId(id, userId)) {
      throw NoSuchElementException("Snapshot $id not found")
    }
    return positionRepository.findBySnapshotId(id).map { it.toDto() }
  }
}
