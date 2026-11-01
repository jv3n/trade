package com.portfolioai.journal

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryRequest
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Pins the future-date guard on New York's day (#842) : at 22:30 in New York UTC has already
 * turned, so a trade dated UTC's day is still tomorrow, on a create as on an update.
 */
@SpringBootTest
class TradeDateGuardIntegrationTest {

  @Autowired private lateinit var service: TradeEntryService
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService
  @MockitoBean private lateinit var clock: Clock

  private lateinit var user: User

  @BeforeEach
  fun setUp() {
    whenever(clock.withZone(any())).thenAnswer { NEW_YORK_EVENING.withZone(it.getArgument(0)) }
    user =
      userRepository.save(
        User(
          email = "guard-${UUID.randomUUID()}@test.local",
          displayName = "Guard",
          provider = "test",
          providerId = null,
          role = Role.USER,
        )
      )
    whenever(authService.getCurrentUser()).thenReturn(user)
  }

  @AfterEach fun tearDown() = userRepository.delete(user)

  @Test
  fun `a trade dated New York's day is accepted while UTC is already on the next one`() {
    val trade = service.createStandalone(TradeEntryRequest(tradeDate = NY_TODAY, ticker = "SGBX"))

    assertEquals(NY_TODAY, trade.tradeDate)
  }

  @Test
  fun `an update can't move a trade to the day New York still calls tomorrow`() {
    val trade = service.createStandalone(TradeEntryRequest(tradeDate = NY_TODAY, ticker = "SGBX"))

    assertThrows(IllegalArgumentException::class.java) {
      service.update(trade.id, TradeEntryRequest(tradeDate = NY_TOMORROW, ticker = "SGBX"))
    }
  }

  private companion object {
    val NEW_YORK_EVENING: Clock = Clock.fixed(Instant.parse("2026-11-02T02:30:00Z"), ZoneOffset.UTC)
    val NY_TODAY: LocalDate = LocalDate.of(2026, 11, 1)
    val NY_TOMORROW: LocalDate = LocalDate.of(2026, 11, 2)
  }
}
