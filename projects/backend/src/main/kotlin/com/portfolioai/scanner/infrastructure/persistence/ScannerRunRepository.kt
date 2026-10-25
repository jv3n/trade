package com.portfolioai.scanner.infrastructure.persistence

import com.portfolioai.scanner.domain.ScannerRun
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface ScannerRunRepository : JpaRepository<ScannerRun, UUID> {

  fun findFirstByUserIdOrderByStartedAtDesc(userId: UUID): ScannerRun?
}
