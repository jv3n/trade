package com.portfolioai.scanner.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.scanner.application.dto.ScannedStatsRequest
import com.portfolioai.scanner.infrastructure.persistence.ScannerRunRepository
import com.portfolioai.stats.application.ScannedStatService
import java.time.LocalDate
import java.util.Optional
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.springframework.web.server.ResponseStatusException

/**
 * Pins what the scanner is told when `trade` is not set up for it (#763) : without an owner, or
 * with one that does not exist, a push is a 503 — never stats recorded for nobody.
 */
class ScannerServiceTest {

  private val users = mock<UserRepository>()

  @Test
  fun `a push without an owner configured is a 503`() {
    assertEquals(503, statusOfAPush(ownerUserId = ""))
  }

  @Test
  fun `a push for an owner that does not exist is a 503`() {
    whenever(users.findById(any())).thenReturn(Optional.empty())

    assertEquals(503, statusOfAPush(ownerUserId = UUID.randomUUID().toString()))
  }

  private fun statusOfAPush(ownerUserId: String): Int {
    val service =
      ScannerService(
        users,
        mock<ScannedStatService>(),
        mock<ScannerRunRepository>(),
        mock<AuthService>(),
        ownerUserId,
      )
    val error =
      assertThrows(ResponseStatusException::class.java) {
        service.recordStats(ScannedStatsRequest(LocalDate.of(2026, 10, 22), emptyList()))
      }
    return error.statusCode.value()
  }
}
