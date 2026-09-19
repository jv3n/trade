package com.portfolioai.candidates

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.candidates.application.CandidateService
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.candidates.domain.Candidate
import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
import com.portfolioai.shared.Pattern
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
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * End-to-end integration test on [CandidateService] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap, no per-class plumbing) for the **morning capture** model (#186).
 *
 * What it pins :
 * - **Save round-trip** — the ticker is normalised, every premarket field and the pattern (Postgres
 *   `pattern` ENUM) persist, a blank note is stored as null, and the pattern defaults to GUS.
 * - **One candidate per (day, ticker)** — a second capture, or renaming onto a captured ticker, is
 *   a 409 ; the same ticker on another day or another user is fine.
 * - **In-service validation** — non-positive prices, a PM high below the PM open, a negative float
 *   / volume / locate and a blank ticker return a clean 400, not a DB CHECK violation.
 * - **Day listing** — only the requested day's candidates come back.
 * - **Multi-tenant scope** — a foreign / missing id → 404 (never 403).
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic.
 */
@SpringBootTest
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
  fun `create normalises the ticker and persists every premarket field`() {
    val saved =
      service.create(
        request(
          ticker = " ktta ",
          pattern = Pattern.DT,
          floatMillions = BigDecimal("8.2"),
          volumeMillions = BigDecimal("3.1"),
          locatePerShare = BigDecimal("0.03"),
          note = "  Résistance 4,65 — high PM, pas de news  ",
        )
      )

    val reloaded = service.findById(saved.id)
    assertEquals("KTTA", reloaded.ticker, "ticker is trimmed + upper-cased")
    assertEquals(Pattern.DT, reloaded.pattern, "the pattern survives the Postgres ENUM round-trip")
    assertEquals(0, BigDecimal("2.65").compareTo(reloaded.previousClose))
    assertEquals(0, BigDecimal("4.05").compareTo(reloaded.pmOpen))
    assertEquals(0, BigDecimal("4.65").compareTo(reloaded.pmHigh))
    assertEquals(0, BigDecimal("8.2").compareTo(reloaded.floatMillions))
    assertEquals(0, BigDecimal("3.1").compareTo(reloaded.volumeMillions))
    assertEquals(0, BigDecimal("0.03").compareTo(reloaded.locatePerShare))
    assertEquals("Résistance 4,65 — high PM, pas de news", reloaded.note, "note is trimmed")
  }

  @Test
  fun `the pattern defaults to GUS and the optional context stays null`() {
    val saved =
      service.create(
        CandidateRequest(
          tradingDate = DAY,
          ticker = "KTTA",
          previousClose = BigDecimal("2.65"),
          pmOpen = BigDecimal("4.05"),
          pmHigh = BigDecimal("4.65"),
          note = "   ",
        )
      )

    assertEquals(Pattern.GUS, saved.pattern)
    assertNull(saved.floatMillions)
    assertNull(saved.volumeMillions)
    assertNull(saved.locatePerShare)
    assertNull(saved.note, "a blank note is stored as null")
  }

  // ---------------------------------------------------------------------------
  // One candidate per (day, ticker)
  // ---------------------------------------------------------------------------

  @Test
  fun `capturing the same ticker twice on the same day is a 409`() {
    service.create(request(ticker = "KTTA"))

    // Case-insensitive : the ticker is normalised before the check.
    val ex =
      assertThrows(ResponseStatusException::class.java) { service.create(request(ticker = "ktta")) }
    assertEquals(409, ex.statusCode.value())
    assertEquals(1, service.listForDate(DAY).size, "no duplicate row")
  }

  @Test
  fun `the same ticker on another day or for another user is a separate candidate`() {
    service.create(request(ticker = "KTTA", tradingDate = DAY))
    service.create(request(ticker = "KTTA", tradingDate = DAY.minusDays(1)))
    repo.save(makeCandidate(otherUser, "KTTA"))

    assertEquals(1, service.listForDate(DAY).size)
    assertEquals(1, service.listForDate(DAY.minusDays(1)).size)
  }

  @Test
  fun `renaming a candidate onto a ticker already captured that day is a 409`() {
    service.create(request(ticker = "KTTA"))
    val other = service.create(request(ticker = "SGBX"))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(other.id, request(ticker = "KTTA"))
      }
    assertEquals(409, ex.statusCode.value())
  }

  @Test
  fun `updating a candidate without changing its ticker is not a conflict with itself`() {
    val created = service.create(request(ticker = "KTTA"))

    val updated = service.update(created.id, request(ticker = "KTTA", pmHigh = BigDecimal("4.90")))

    assertEquals(0, BigDecimal("4.90").compareTo(updated.pmHigh))
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  @Test
  fun `a non-positive previous close, PM open or PM high is a 400`() {
    listOf(
        request(previousClose = BigDecimal.ZERO),
        request(pmOpen = BigDecimal("-1")),
        request(pmHigh = BigDecimal.ZERO),
      )
      .forEach { invalid ->
        val ex = assertThrows(ResponseStatusException::class.java) { service.create(invalid) }
        assertEquals(400, ex.statusCode.value())
      }
  }

  @Test
  fun `a PM high below the PM open is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(pmOpen = BigDecimal("4.05"), pmHigh = BigDecimal("3.90")))
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `a negative float, volume or locate is a 400`() {
    listOf(
        request(floatMillions = BigDecimal("-1")),
        request(volumeMillions = BigDecimal("-0.5")),
        request(locatePerShare = BigDecimal("-0.01")),
      )
      .forEach { invalid ->
        val ex = assertThrows(ResponseStatusException::class.java) { service.create(invalid) }
        assertEquals(400, ex.statusCode.value())
      }
  }

  @Test
  fun `a blank ticker is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) { service.create(request(ticker = "   ")) }
    assertEquals(400, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Day listing
  // ---------------------------------------------------------------------------

  @Test
  fun `listForDate returns only the requested day's candidates, ticker-ascending`() {
    service.create(request(ticker = "SGBX", tradingDate = DAY))
    service.create(request(ticker = "BNRG", tradingDate = DAY))
    service.create(request(ticker = "KTTA", tradingDate = DAY.minusDays(1)))

    val day = service.listForDate(DAY)

    assertEquals(listOf("BNRG", "SGBX"), day.map { it.ticker })
  }

  // ---------------------------------------------------------------------------
  // Update + multi-tenant scope
  // ---------------------------------------------------------------------------

  @Test
  fun `update overwrites fields and bumps updatedAt`() {
    val created = service.create(request(ticker = "KTTA"))
    Thread.sleep(10) // let the next now() fall on a later instant

    val updated =
      service.update(
        created.id,
        request(ticker = "SGBX", pattern = Pattern.DISCRETIONARY, pmOpen = BigDecimal("4.20")),
      )

    assertEquals("SGBX", updated.ticker)
    assertEquals(Pattern.DISCRETIONARY, updated.pattern)
    assertEquals(0, BigDecimal("4.20").compareTo(updated.pmOpen))
    assertTrue(updated.updatedAt.isAfter(created.updatedAt))
  }

  @Test
  fun `fetching or editing a foreign candidate returns 404, not 403`() {
    val foreign = repo.save(makeCandidate(otherUser, "TSLA"))

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
    val created = service.create(request(ticker = "KTTA"))

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

  private fun makeCandidate(owner: User, ticker: String) =
    Candidate(
      user = owner,
      tradingDate = DAY,
      ticker = ticker,
      previousClose = BigDecimal("2.65"),
      pmOpen = BigDecimal("4.05"),
      pmHigh = BigDecimal("4.65"),
    )

  /** KTTA on 09/17 — the example of `mockup/PARCOURS.md › Étape 1` (gap +52.8 %, push +14.8 %). */
  private fun request(
    ticker: String = "KTTA",
    tradingDate: LocalDate = DAY,
    pattern: Pattern = Pattern.GUS,
    previousClose: BigDecimal = BigDecimal("2.65"),
    pmOpen: BigDecimal = BigDecimal("4.05"),
    pmHigh: BigDecimal = BigDecimal("4.65"),
    floatMillions: BigDecimal? = null,
    volumeMillions: BigDecimal? = null,
    locatePerShare: BigDecimal? = null,
    note: String? = null,
  ) =
    CandidateRequest(
      tradingDate = tradingDate,
      pattern = pattern,
      ticker = ticker,
      previousClose = previousClose,
      pmOpen = pmOpen,
      pmHigh = pmHigh,
      floatMillions = floatMillions,
      volumeMillions = volumeMillions,
      locatePerShare = locatePerShare,
      note = note,
    )

  private companion object {
    val DAY: LocalDate = LocalDate.of(2026, 9, 17)
  }
}
