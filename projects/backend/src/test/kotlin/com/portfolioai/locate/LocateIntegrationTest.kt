package com.portfolioai.locate

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.candidates.application.CandidateService
import com.portfolioai.candidates.application.dto.CandidateDto
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.locate.application.LocateChangedEvent
import com.portfolioai.locate.application.LocateService
import com.portfolioai.locate.application.dto.LocateRequest
import com.portfolioai.locate.application.dto.LocateUpdateRequest
import com.portfolioai.locate.infrastructure.persistence.LocateRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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
 * - **Taken on a candidate**, a locate takes its day and ticker, and its locate quote as the price
 *   unless another is sent (a top-up often goes at another price).
 * - **With no candidate**, the day, the ticker and the price are required.
 * - **The cost is shares × price**, never typed.
 * - **Several locates per (day, ticker)** are normal — a top-up.
 * - **Every change is published** for the account's movement — its cost, its candidate, and whether
 *   it is a deletion.
 * - **A deleted candidate leaves its locates**, detached but still saying what the money was for.
 * - **Multi-tenant scope**.
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic.
 */
@SpringBootTest
@RecordApplicationEvents
class LocateIntegrationTest {

  @Autowired private lateinit var service: LocateService
  @Autowired private lateinit var repo: LocateRepository
  @Autowired private lateinit var candidates: CandidateService
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
  fun `a locate on a candidate takes its day, its ticker and its quote, and costs shares × price`() {
    val sgbx = candidate(ticker = "SGBX", locatePerShare = BigDecimal("0.12"))

    val locate = service.create(LocateRequest(shares = 2000, candidateId = sgbx.id))

    assertEquals(DAY, locate.tradingDate)
    assertEquals("SGBX", locate.ticker)
    assertEquals(0, BigDecimal("0.12").compareTo(locate.pricePerShare))
    assertEquals(BigDecimal("240.00"), locate.cost)
    assertEquals(sgbx.id, locate.candidateId)
  }

  @Test
  fun `a top-up at another price keeps its own price`() {
    val sgbx = candidate(ticker = "SGBX", locatePerShare = BigDecimal("0.12"))
    service.create(LocateRequest(shares = 2000, candidateId = sgbx.id))

    service.create(
      LocateRequest(shares = 1000, candidateId = sgbx.id, pricePerShare = BigDecimal("0.15"))
    )

    val day = service.listForCandidate(sgbx.id)
    assertEquals(listOf(2000, 1000), day.map { it.shares })
    assertEquals(listOf(BigDecimal("240.00"), BigDecimal("150.00")), day.map { it.cost })
  }

  @Test
  fun `a candidate with no quote needs the price to be sent`() {
    val ktta = candidate(ticker = "KTTA", locatePerShare = null)

    val ex =
      assertThrows<ResponseStatusException> {
        service.create(LocateRequest(shares = 500, candidateId = ktta.id))
      }
    assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
  }

  @Test
  fun `a locate with no candidate takes the day, the ticker and the price it is given`() {
    val locate =
      service.create(
        LocateRequest(
          shares = 1000,
          tradingDate = DAY,
          ticker = " atxg ",
          pricePerShare = BigDecimal("0.056"),
        )
      )

    assertEquals("ATXG", locate.ticker)
    assertNull(locate.candidateId)
    assertEquals(BigDecimal("56.00"), locate.cost)
  }

  @Test
  fun `a locate with no candidate refuses a missing day, ticker or price`() {
    val requests =
      listOf(
        LocateRequest(shares = 1000, ticker = "ATXG", pricePerShare = BigDecimal("0.05")),
        LocateRequest(shares = 1000, tradingDate = DAY, pricePerShare = BigDecimal("0.05")),
        LocateRequest(shares = 1000, tradingDate = DAY, ticker = "ATXG"),
      )
    requests.forEach { request ->
      val ex = assertThrows<ResponseStatusException> { service.create(request) }
      assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }
  }

  @Test
  fun `refuses zero shares and a negative price`() {
    val zero =
      assertThrows<ResponseStatusException> {
        service.create(detached(shares = 0, price = BigDecimal("0.05")))
      }
    val negative =
      assertThrows<ResponseStatusException> {
        service.create(detached(shares = 100, price = BigDecimal("-0.01")))
      }
    assertEquals(HttpStatus.BAD_REQUEST, zero.statusCode)
    assertEquals(HttpStatus.BAD_REQUEST, negative.statusCode)
  }

  @Test
  fun `lists a day's locates, oldest first, narrowed to a ticker on demand`() {
    service.create(detached(ticker = "SGBX", shares = 2000))
    service.create(detached(ticker = "MLGO", shares = 2000))
    service.create(detached(ticker = "SGBX", shares = 1000))

    assertEquals(listOf("SGBX", "MLGO", "SGBX"), service.listForDate(DAY, null).map { it.ticker })
    assertEquals(listOf(2000, 1000), service.listForDate(DAY, "sgbx").map { it.shares })
    assertTrue(service.listForDate(DAY.plusDays(1), null).isEmpty())
  }

  @Test
  fun `publishes each change with its cost and its candidate, the deletion flagged`() {
    val sgbx = candidate(ticker = "SGBX", locatePerShare = BigDecimal("0.05"))
    val created = service.create(LocateRequest(shares = 1000, candidateId = sgbx.id))
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
    assertTrue(
      published.all {
        it.locateId == created.id && it.userId == testUser.id && it.candidateId == sgbx.id
      }
    )
    assertTrue(repo.findById(created.id).isEmpty)
  }

  @Test
  fun `correcting a locate changes its shares, price and note — not its day or ticker`() {
    val created = service.create(detached(ticker = "VERB", shares = 1000))

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

  // A locate is money spent : deleting the candidate it came from must not erase what it was for.
  @Test
  fun `a deleted candidate leaves its locates, detached but still readable`() {
    val sgbx = candidate(ticker = "SGBX", locatePerShare = BigDecimal("0.12"))
    val locate = service.create(LocateRequest(shares = 2000, candidateId = sgbx.id))

    candidates.delete(sgbx.id)

    val kept = service.listForDate(DAY, null).single()
    assertEquals(locate.id, kept.id)
    assertNull(kept.candidateId)
    assertEquals("SGBX", kept.ticker)
  }

  @Test
  fun `another user's locates and candidates are out of reach`() {
    whenever(authService.getCurrentUser()).thenReturn(otherUser)
    val theirs = service.create(detached(shares = 1000))
    val theirCandidate = candidate(ticker = "NXTT", locatePerShare = BigDecimal("0.02"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)

    assertTrue(service.listForDate(DAY, null).isEmpty())
    val update =
      assertThrows<ResponseStatusException> {
        service.update(theirs.id, LocateUpdateRequest(shares = 1, pricePerShare = BigDecimal.ONE))
      }
    val onTheirCandidate =
      assertThrows<ResponseStatusException> {
        service.create(LocateRequest(shares = 100, candidateId = theirCandidate.id))
      }
    assertEquals(HttpStatus.NOT_FOUND, update.statusCode)
    assertEquals(HttpStatus.NOT_FOUND, onTheirCandidate.statusCode)
  }

  private fun candidate(ticker: String, locatePerShare: BigDecimal?): CandidateDto =
    candidates.create(
      CandidateRequest(
        tradingDate = DAY,
        ticker = ticker,
        previousClose = BigDecimal("1.12"),
        pmOpen = BigDecimal("1.85"),
        pmHigh = BigDecimal("2.46"),
        locatePerShare = locatePerShare,
      )
    )

  private fun detached(
    ticker: String = "ATXG",
    shares: Int = 1000,
    price: BigDecimal = BigDecimal("0.05"),
  ) = LocateRequest(shares = shares, tradingDate = DAY, ticker = ticker, pricePerShare = price)

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
