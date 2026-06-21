package com.portfolioai.candidates

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.candidates.application.CandidateService
import com.portfolioai.candidates.application.dto.CandidateEntry
import com.portfolioai.candidates.application.dto.CandidateExit
import com.portfolioai.candidates.application.dto.CandidateFill
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.candidates.domain.Candidate
import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * End-to-end integration test on [CandidateService] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap, no per-class plumbing).
 *
 * What it pins :
 * - **Save round-trip** — the ticker is normalised, the params persist, and the `fills` / `entries`
 *   / `exits` JSON ladders survive the Postgres `jsonb` round-trip as typed objects (catches a
 *   regression in the `@JdbcTypeCode(JSON)` ↔ ObjectMapper marshalling).
 * - **In-service validation** — a non-positive open price / capital and an out-of-range risk %
 *   return a clean 400, not a DB CHECK violation.
 * - **Date-driven lifecycle** — the dropdown query returns only the requested session's candidates
 *   ; a past-date candidate is invisible without being deleted.
 * - **Multi-tenant scope** — a foreign / missing id → 404 (never 403), and listing never reaches
 *   across tenants.
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class CandidateIntegrationTest {

  @Autowired private lateinit var service: CandidateService
  @Autowired private lateinit var repo: CandidateRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = userRepository.save(makeUser("trader"))
    otherUser = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  // ---------------------------------------------------------------------------
  // Save round-trip
  // ---------------------------------------------------------------------------

  @Test
  fun `create normalises the ticker, persists the params and round-trips the ladders`() {
    val saved =
      service.create(
        request(
          ticker = " casst ",
          fills =
            listOf(CandidateFill(BigDecimal("0.10"), 200), CandidateFill(BigDecimal("0.20"), 400)),
          entries = listOf(CandidateEntry(BigDecimal("3.21"), 200)),
          exits = listOf(CandidateExit(BigDecimal("3.00"), 200)),
        )
      )

    assertEquals("CASST", saved.ticker, "ticker is trimmed + upper-cased")
    assertEquals(0, BigDecimal("12.0400").compareTo(saved.openPrice))

    // The JSON ladders survive the jsonb round-trip as typed objects.
    val reloaded = service.findById(saved.id)
    assertEquals(2, reloaded.fills.size)
    assertEquals(0, BigDecimal("0.10").compareTo(reloaded.fills[0].step))
    assertEquals(200, reloaded.fills[0].sharesInPlay)
    assertEquals(1, reloaded.entries.size)
    assertEquals(0, BigDecimal("3.21").compareTo(reloaded.entries[0].entryPrice))
    assertEquals(200, reloaded.entries[0].sharesInPlay)
    assertEquals(1, reloaded.exits.size)
    assertEquals(200, reloaded.exits[0].sharesCovered)
  }

  @Test
  fun `saving the same date and ticker upserts in place instead of duplicating`() {
    val first = service.create(request(ticker = "CASST", openPrice = BigDecimal("12.04")))
    // Same session + ticker (case-insensitive) with a new open price → updates the same row.
    val second = service.create(request(ticker = "casst", openPrice = BigDecimal("13.00")))

    assertEquals(first.id, second.id, "same (date, ticker) → updated in place")
    assertEquals(0, BigDecimal("13.0000").compareTo(second.openPrice))
    assertEquals(1, service.listForDate(LocalDate.of(2026, 6, 19)).size, "no duplicate row")
  }

  @Test
  fun `a different ticker on the same date creates a separate candidate`() {
    service.create(request(ticker = "AAA"))
    service.create(request(ticker = "BBB"))

    assertEquals(2, service.listForDate(LocalDate.of(2026, 6, 19)).size)
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  @Test
  fun `a non-positive open price is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(openPrice = BigDecimal.ZERO))
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `a capital-at-risk percent of zero or above 100 is a 400`() {
    val tooHigh =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(pctCapitalAtRisk = BigDecimal("150")))
      }
    assertEquals(400, tooHigh.statusCode.value())

    val zero =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(pctCapitalAtRisk = BigDecimal.ZERO))
      }
    assertEquals(400, zero.statusCode.value())
  }

  @Test
  fun `a blank ticker is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) { service.create(request(ticker = "   ")) }
    assertEquals(400, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Date-driven lifecycle
  // ---------------------------------------------------------------------------

  @Test
  fun `listForDate returns only the requested session's candidates`() {
    val today = LocalDate.of(2026, 6, 19)
    val yesterday = today.minusDays(1)
    service.create(request(ticker = "AAA", tradingDate = today))
    service.create(request(ticker = "BBB", tradingDate = today))
    service.create(request(ticker = "OLD", tradingDate = yesterday)) // closed — off the picker

    val day = service.listForDate(today)

    assertEquals(2, day.size, "only today's candidates feed the dropdown")
    assertEquals(listOf("AAA", "BBB"), day.map { it.ticker }, "ticker-ascending")
  }

  // ---------------------------------------------------------------------------
  // Update + multi-tenant scope
  // ---------------------------------------------------------------------------

  @Test
  fun `update overwrites fields and bumps updatedAt`() {
    val created = service.create(request(ticker = "AAA"))
    Thread.sleep(10) // let the next now() fall on a later instant

    val updated =
      service.update(created.id, request(ticker = "ZZZ", openPrice = BigDecimal("15.00")))

    assertEquals("ZZZ", updated.ticker)
    assertEquals(0, BigDecimal("15.0000").compareTo(updated.openPrice))
    assertTrue(updated.updatedAt.isAfter(created.updatedAt))
  }

  @Test
  fun `fetching or editing a foreign candidate returns 404, not 403`() {
    val foreign =
      repo.save(
        Candidate(
          user = otherUser,
          tradingDate = LocalDate.of(2026, 6, 19),
          ticker = "TSLA",
          totalCapital = BigDecimal("7300.00"),
          pctCapitalAtRisk = BigDecimal("5.00"),
          openPrice = BigDecimal("12.0400"),
        )
      )

    val get = assertThrows(ResponseStatusException::class.java) { service.findById(foreign.id) }
    assertEquals(404, get.statusCode.value(), "must not leak existence — 404, never 403")

    val edit =
      assertThrows(ResponseStatusException::class.java) {
        service.update(foreign.id, request(ticker = "TSLA"))
      }
    assertEquals(404, edit.statusCode.value())
  }

  @Test
  fun `delete removes a candidate and a second delete is a 404`() {
    val created = service.create(request(ticker = "AAA"))

    service.delete(created.id)
    assertNull(repo.findByIdAndUserId(created.id, testUser.id))

    val ex = assertThrows(ResponseStatusException::class.java) { service.delete(created.id) }
    assertEquals(404, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )

  private fun request(
    ticker: String = "CASST",
    tradingDate: LocalDate = LocalDate.of(2026, 6, 19),
    totalCapital: BigDecimal = BigDecimal("7300.00"),
    pctCapitalAtRisk: BigDecimal = BigDecimal("5.00"),
    openPrice: BigDecimal = BigDecimal("12.04"),
    stopPct: BigDecimal? = BigDecimal("40.00"),
    fills: List<CandidateFill> = emptyList(),
    entries: List<CandidateEntry> = emptyList(),
    exits: List<CandidateExit> = emptyList(),
  ) =
    CandidateRequest(
      tradingDate = tradingDate,
      ticker = ticker,
      totalCapital = totalCapital,
      pctCapitalAtRisk = pctCapitalAtRisk,
      openPrice = openPrice,
      stopPct = stopPct,
      previousClose = BigDecimal("3.90"),
      fills = fills,
      entries = entries,
      exits = exits,
    )
}
