package com.portfolioai.tradingday

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.tradingday.application.TradingDayService
import com.portfolioai.tradingday.application.dto.TradingDayRequest
import com.portfolioai.tradingday.infrastructure.persistence.TradingDayRepository
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Integration test on [TradingDayService] + JPA → Postgres for the « nothing today » marks of the
 * Today page (#407).
 *
 * What it pins :
 * - **A day with nothing declared** reads as two null marks, never a 404.
 * - **Each mark is independent** — « no trade » on a day with candidates is the common case.
 * - **A mark keeps the instant it was first set** when the day is written again, so the time shown
 *   on the step doesn't move when the other mark changes.
 * - **Clearing both marks removes the row** — a stored row always says something.
 * - **Multi-tenant scope** — another user's marks on the same day are invisible.
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic.
 */
@SpringBootTest
class TradingDayIntegrationTest {

  @Autowired private lateinit var service: TradingDayService
  @Autowired private lateinit var repo: TradingDayRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    testUser = userRepository.save(makeUser("trader"))
    otherUser = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  @Test
  fun `a day with nothing declared reads as two empty marks`() {
    val day = service.get(DAY)

    assertEquals(DAY, day.tradingDate)
    assertNull(day.noCandidateAt)
    assertNull(day.noTradeAt)
  }

  @Test
  fun `a day with stats and no trade carries the no-trade mark alone`() {
    service.put(DAY, TradingDayRequest(noCandidate = false, noTrade = true))

    val day = service.get(DAY)
    assertNull(day.noCandidateAt)
    assertNotNull(day.noTradeAt)
  }

  @Test
  fun `a mark keeps the instant it was first set when the other one changes`() {
    service.put(DAY, TradingDayRequest(noCandidate = true, noTrade = false))
    // Read back rather than taken from `put` : Postgres keeps microseconds, the JVM clock has more.
    val first = service.get(DAY)
    // The evening : nothing on the radar this morning, no trade either.
    val second = service.put(DAY, TradingDayRequest(noCandidate = true, noTrade = true))

    assertEquals(first.noCandidateAt, second.noCandidateAt)
    assertNotNull(second.noTradeAt)
  }

  @Test
  fun `undoing one mark leaves the other in place`() {
    service.put(DAY, TradingDayRequest(noCandidate = true, noTrade = true))

    service.put(DAY, TradingDayRequest(noCandidate = true, noTrade = false))

    val day = service.get(DAY)
    assertNotNull(day.noCandidateAt)
    assertNull(day.noTradeAt)
  }

  @Test
  fun `clearing both marks removes the day's row`() {
    service.put(DAY, TradingDayRequest(noCandidate = true, noTrade = false))

    service.put(DAY, TradingDayRequest(noCandidate = false, noTrade = false))

    assertNull(repo.findByUserIdAndTradingDate(testUser.id, DAY))
    assertNull(service.get(DAY).noCandidateAt)
  }

  @Test
  fun `another user's marks on the same day are invisible`() {
    whenever(authService.getCurrentUser()).thenReturn(otherUser)
    service.put(DAY, TradingDayRequest(noCandidate = true, noTrade = true))

    whenever(authService.getCurrentUser()).thenReturn(testUser)
    val day = service.get(DAY)
    assertNull(day.noCandidateAt)
    assertNull(day.noTradeAt)
  }

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )

  private companion object {
    val DAY: LocalDate = LocalDate.of(2026, 9, 25)
  }
}
