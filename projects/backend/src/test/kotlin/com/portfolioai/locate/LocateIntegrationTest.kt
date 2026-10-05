package com.portfolioai.locate

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.locate.application.LocateChangedEvent
import com.portfolioai.locate.application.LocateService
import com.portfolioai.locate.application.dto.LocateRequest
import com.portfolioai.locate.application.dto.LocateUpdateRequest
import com.portfolioai.locate.infrastructure.persistence.LocateRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.event.ApplicationEvents
import org.springframework.test.context.event.RecordApplicationEvents
import org.springframework.web.server.ResponseStatusException

/**
 * Integration test on [LocateService] + JPA → Postgres for the locates of #602 — shares located
 * before a short, billed per share whether or not the trade happens.
 *
 * What it pins :
 * - **A locate is a cost on a (day, ticker)** (#625) — the day, the ticker and the price it is
 *   given, the ticker normalised ; no link to a candidate or a trade.
 * - **The cost is shares × price**, never typed ; the share's price is kept with it, optional.
 * - **Several locates per (day, ticker)** are normal — a top-up, often at another price.
 * - **Every change is published** for the account's movement — its cost, and whether it is a
 *   deletion.
 * - **Multi-tenant scope**.
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic.
 */
@SpringBootTest
@RecordApplicationEvents
class LocateIntegrationTest {

  @Autowired private lateinit var service: LocateService
  @Autowired private lateinit var repo: LocateRepository
  @Autowired private lateinit var userRepository: UserRepository
  @Autowired private lateinit var events: ApplicationEvents

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
  fun `a locate takes the day, the ticker and the price it is given, and costs shares × price`() {
    val locate =
      service.create(locate(ticker = " sgbx ", shares = 2000, price = BigDecimal("0.12")))

    assertEquals(DAY, locate.tradingDate)
    assertEquals("SGBX", locate.ticker)
    assertEquals(BigDecimal("240.00"), locate.cost)
  }

  @Test
  fun `a top-up at another price keeps its own price`() {
    service.create(locate(ticker = "SGBX", shares = 2000, price = BigDecimal("0.12")))

    service.create(locate(ticker = "SGBX", shares = 1000, price = BigDecimal("0.15")))

    val day = service.listForDate(DAY, "SGBX")
    assertEquals(listOf(2000, 1000), day.map { it.shares })
    assertEquals(listOf(BigDecimal("240.00"), BigDecimal("150.00")), day.map { it.cost })
  }

  // The locate's weight against the share is read off this price — optional, typed with it.
  @Test
  fun `keeps the share's price it was taken at, and lets a correction change it`() {
    val created =
      service.create(locate(price = BigDecimal("0.05"), stockPrice = BigDecimal("2.50")))
    assertEquals(0, BigDecimal("2.50").compareTo(created.stockPrice))

    val updated =
      service.update(
        created.id,
        LocateUpdateRequest(
          shares = 1000,
          pricePerShare = BigDecimal("0.05"),
          stockPrice = BigDecimal("2.80"),
        ),
      )

    assertEquals(0, BigDecimal("2.80").compareTo(updated.stockPrice))
  }

  @Test
  fun `refuses zero shares, a negative price, a share price of zero and a blank ticker`() {
    listOf(
        locate(shares = 0),
        locate(price = BigDecimal("-0.01")),
        locate(stockPrice = BigDecimal.ZERO),
        locate(ticker = "  "),
      )
      .forEach { request ->
        val ex = assertThrows<ResponseStatusException> { service.create(request) }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
      }
  }

  @Test
  fun `lists a day's locates, oldest first, narrowed to a ticker on demand`() {
    service.create(locate(ticker = "SGBX", shares = 2000))
    service.create(locate(ticker = "MLGO", shares = 2000))
    service.create(locate(ticker = "SGBX", shares = 1000))

    assertEquals(listOf("SGBX", "MLGO", "SGBX"), service.listForDate(DAY, null).map { it.ticker })
    assertEquals(listOf(2000, 1000), service.listForDate(DAY, "sgbx").map { it.shares })
    assertTrue(service.listForDate(DAY.plusDays(1), null).isEmpty())
  }

  @Test
  fun `publishes each change with its cost, the deletion flagged`() {
    val created = service.create(locate(shares = 1000, price = BigDecimal("0.05")))
    service.update(
      created.id,
      LocateUpdateRequest(shares = 800, pricePerShare = BigDecimal("0.05")),
    )
    service.delete(created.id)

    val published = events.stream(LocateChangedEvent::class.java).toList()
    assertEquals(
      listOf(BigDecimal("50.00"), BigDecimal("40.00"), BigDecimal("40.00")),
      published.map { it.cost },
    )
    assertEquals(listOf(false, false, true), published.map { it.deleted })
    assertTrue(published.all { it.locateId == created.id && it.userId == testUser.id })
    assertTrue(repo.findById(created.id).isEmpty)
  }

  @Test
  fun `correcting a locate changes its shares, price and note — not its day or ticker`() {
    val created = service.create(locate(ticker = "VERB", shares = 1000))

    val updated =
      service.update(
        created.id,
        LocateUpdateRequest(shares = 1500, pricePerShare = BigDecimal("0.04"), note = " top-up "),
      )

    assertEquals(1500, updated.shares)
    assertEquals(BigDecimal("60.00"), updated.cost)
    assertEquals("top-up", updated.note)
    assertEquals("VERB", updated.ticker)
    assertEquals(DAY, updated.tradingDate)
  }

  @Test
  fun `another user's locates are out of reach`() {
    whenever(authService.getCurrentUser()).thenReturn(otherUser)
    val theirs = service.create(locate(shares = 1000))
    whenever(authService.getCurrentUser()).thenReturn(testUser)

    assertTrue(service.listForDate(DAY, null).isEmpty())
    val update =
      assertThrows<ResponseStatusException> {
        service.update(theirs.id, LocateUpdateRequest(shares = 1, pricePerShare = BigDecimal.ONE))
      }
    val delete = assertThrows<ResponseStatusException> { service.delete(theirs.id) }
    assertEquals(HttpStatus.NOT_FOUND, update.statusCode)
    assertEquals(HttpStatus.NOT_FOUND, delete.statusCode)
  }

  private fun locate(
    ticker: String = "ATXG",
    shares: Int = 1000,
    price: BigDecimal = BigDecimal("0.05"),
    stockPrice: BigDecimal? = null,
  ) =
    LocateRequest(
      tradingDate = DAY,
      ticker = ticker,
      shares = shares,
      pricePerShare = price,
      stockPrice = stockPrice,
    )

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )

  private companion object {
    val DAY: LocalDate = LocalDate.of(2026, 9, 18)
  }
}
