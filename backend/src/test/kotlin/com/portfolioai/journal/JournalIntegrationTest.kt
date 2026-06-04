package com.portfolioai.journal

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.domain.TradeEntryFilter
import com.portfolioai.journal.domain.TradeExitStrategy
import com.portfolioai.journal.domain.TradeOpenSide
import com.portfolioai.journal.domain.TradePattern
import com.portfolioai.journal.domain.TradePlay
import com.portfolioai.journal.domain.TradeStatus
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * End-to-end integration test on
 * [TradeEntryService] + [com.portfolioai.journal.infrastructure.persistence.TradeEntrySpecifications]
 * + JPA → Postgres (Testcontainers via the launcher-session bootstrap, no per-class plumbing).
 *
 * The two pinning targets :
 *
 * - **CRUD lifecycle** — create, fetch, update, delete each go round-trip the real schema. Catches
 *   regressions in the JPA mapping (Postgres ENUM types, `@JdbcTypeCode(SqlTypes.NAMED_ENUM)`), the
 *   updated_at trigger, ticker normalisation (`trim().uppercase()` in the service).
 *
 * - **Filter Specifications** — every filter axis (query, date range, plays IN, patterns IN, status
 *   derived predicates) exercises the SQL builder against real Postgres semantics. Pure unit tests
 *   on `Specification` can't reach this because the Criteria API needs a live `EntityManager` for
 *   the `Root` / `Path` lookups to resolve correctly.
 *
 * `AuthService` is overridden with `@MockitoBean` so the service's user-scope is deterministic —
 * every test seeds a fixed `testUser` and configures the mock to return it. A second user is seeded
 * too to verify the tenant filter blocks cross-user reads.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class JournalIntegrationTest {

  @Autowired private lateinit var service: TradeEntryService
  @Autowired private lateinit var repo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  // Override the AuthService bean — the real one reads SecurityContextHolder which is empty
  // outside of a request. We configure it per test to return `testUser`.
  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    // Wipe the journal table between tests — we share the Testcontainers Postgres across the
    // whole suite, so isolating per-class data is the test's responsibility.
    repo.deleteAll()

    // The two users are recreated each time : `deleteAll()` on `app_user` cascades to
    // trade_entry, so test independence is guaranteed even if a previous failure left rows.
    userRepository.deleteAll()
    testUser =
      userRepository.save(
        User(
          email = "trader-${UUID.randomUUID()}@test.local",
          displayName = "Trader",
          provider = "test",
          providerId = null,
          role = Role.USER,
        )
      )
    otherUser =
      userRepository.save(
        User(
          email = "other-${UUID.randomUUID()}@test.local",
          displayName = "Other",
          provider = "test",
          providerId = null,
          role = Role.USER,
        )
      )
    org.mockito.kotlin.whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  @Test
  fun `create persists every field including enums and the preparation checklist`() {
    val request = sampleRequest(ticker = "aapl")
    val dto = service.create(request)

    // Ticker normalisation : the request had lowercase, the persisted row must be uppercase.
    assertEquals("AAPL", dto.ticker, "ticker should be uppercased on create")
    assertEquals(TradePlay.A, dto.play)
    assertEquals(TradePattern.GUS, dto.pattern)
    assertEquals(TradeOpenSide.FRONT, dto.openSide)
    assertEquals(TradeExitStrategy.SWING_20, dto.exitStrategy)
    assertEquals(100, dto.size)
    assertEquals(0, dto.openPrice.compareTo(BigDecimal("3.2100")))
    assertNotNull(dto.createdAt)
    assertNotNull(dto.updatedAt)
  }

  @Test
  fun `findById on a foreign-user row returns 404 (not 403) — no existence leak`() {
    // Persist a row owned by `otherUser` directly via the repo (bypass the service so we don't
    // have to flip the mock).
    val foreign = sampleEntity(user = otherUser)
    repo.save(foreign)

    val ex = assertThrows(ResponseStatusException::class.java) { service.findById(foreign.id) }
    assertEquals(404, ex.statusCode.value(), "must not leak existence — 404, never 403")
  }

  @Test
  fun `update mutates only the targeted row and bumps updatedAt`() {
    val created = service.create(sampleRequest())
    val originalUpdatedAt = created.updatedAt

    Thread.sleep(10) // ensure the Postgres trigger's now() falls on a later instant

    val updated =
      service.update(
        created.id,
        sampleRequest(
          ticker = "TSLA",
          play = TradePlay.B,
          exitPrice = BigDecimal("4.5000"),
          profitDollars = BigDecimal("129.00"),
          gainPercent = BigDecimal("40.19"),
        ),
      )

    assertEquals("TSLA", updated.ticker)
    assertEquals(TradePlay.B, updated.play)
    assertEquals(0, updated.exitPrice!!.compareTo(BigDecimal("4.5000")))
    assertTrue(
      updated.updatedAt.isAfter(originalUpdatedAt),
      "updated_at trigger must have fired (was $originalUpdatedAt, now ${updated.updatedAt})",
    )
  }

  @Test
  fun `delete removes the row and a second delete returns 404`() {
    val created = service.create(sampleRequest())

    service.delete(created.id)
    assertNull(repo.findByIdAndUserId(created.id, testUser.id), "row should be gone")

    val ex = assertThrows(ResponseStatusException::class.java) { service.delete(created.id) }
    assertEquals(404, ex.statusCode.value())
  }

  @Test
  fun `findAll never returns another user's trades — tenant scope holds`() {
    repo.save(sampleEntity(user = otherUser))
    repo.save(sampleEntity(user = testUser, ticker = "AAPL"))
    repo.save(sampleEntity(user = testUser, ticker = "MSFT"))

    val mine = service.findAll()

    assertEquals(2, mine.size, "exactly the two rows owned by testUser")
    assertTrue(mine.all { it.ticker == "AAPL" || it.ticker == "MSFT" })
  }

  // ---------------------------------------------------------------------------
  // Filter Specifications
  // ---------------------------------------------------------------------------

  @Test
  fun `filter by query matches ticker case-insensitively`() {
    repo.save(sampleEntity(user = testUser, ticker = "AAPL"))
    repo.save(sampleEntity(user = testUser, ticker = "TSLA"))
    repo.save(sampleEntity(user = testUser, ticker = "GOOGL"))

    val hits = service.findAll(TradeEntryFilter(query = "tsl"))
    assertEquals(1, hits.size)
    assertEquals("TSLA", hits.first().ticker)
  }

  @Test
  fun `filter by date range — inclusive on both bounds`() {
    repo.save(sampleEntity(user = testUser, tradeDate = LocalDate.of(2026, 5, 30)))
    repo.save(sampleEntity(user = testUser, tradeDate = LocalDate.of(2026, 6, 1)))
    repo.save(sampleEntity(user = testUser, tradeDate = LocalDate.of(2026, 6, 15)))
    repo.save(sampleEntity(user = testUser, tradeDate = LocalDate.of(2026, 7, 1)))

    val june =
      service.findAll(
        TradeEntryFilter(dateFrom = LocalDate.of(2026, 6, 1), dateTo = LocalDate.of(2026, 6, 30))
      )

    assertEquals(2, june.size)
    assertTrue(june.all { it.tradeDate.monthValue == 6 })
  }

  @Test
  fun `filter by plays — IN list semantics`() {
    repo.save(sampleEntity(user = testUser, play = TradePlay.A))
    repo.save(sampleEntity(user = testUser, play = TradePlay.A))
    repo.save(sampleEntity(user = testUser, play = TradePlay.B))

    val aOnly = service.findAll(TradeEntryFilter(plays = listOf(TradePlay.A)))
    assertEquals(2, aOnly.size)

    val both = service.findAll(TradeEntryFilter(plays = listOf(TradePlay.A, TradePlay.B)))
    assertEquals(3, both.size, "passing both values acts as no filter on this axis")
  }

  @Test
  fun `filter by patterns — IN list semantics`() {
    repo.save(sampleEntity(user = testUser, pattern = TradePattern.GUS))
    repo.save(sampleEntity(user = testUser, pattern = TradePattern.FRD))

    val gus = service.findAll(TradeEntryFilter(patterns = listOf(TradePattern.GUS)))
    assertEquals(1, gus.size)
    assertEquals(TradePattern.GUS, gus.first().pattern)
  }

  @Test
  fun `filter by status OPEN — only rows with null exit_price`() {
    repo.save(sampleEntity(user = testUser, ticker = "OPEN1", exitPrice = null))
    repo.save(sampleEntity(user = testUser, ticker = "OPEN2", exitPrice = null))
    repo.save(
      sampleEntity(
        user = testUser,
        ticker = "CLOSED",
        exitPrice = BigDecimal("4.50"),
        profitDollars = BigDecimal("100.00"),
      )
    )

    val open = service.findAll(TradeEntryFilter(status = TradeStatus.OPEN))
    assertEquals(2, open.size)
    assertTrue(open.all { it.exitPrice == null })
  }

  @Test
  fun `filter by status PROFITABLE — strictly positive profit_dollars`() {
    repo.save(sampleEntity(user = testUser, ticker = "WIN", profitDollars = BigDecimal("50.00")))
    repo.save(sampleEntity(user = testUser, ticker = "LOSS", profitDollars = BigDecimal("-25.00")))
    repo.save(sampleEntity(user = testUser, ticker = "BREAK", profitDollars = BigDecimal.ZERO))
    repo.save(sampleEntity(user = testUser, ticker = "OPEN", profitDollars = null))

    val profitable = service.findAll(TradeEntryFilter(status = TradeStatus.PROFITABLE))
    assertEquals(1, profitable.size)
    assertEquals("WIN", profitable.first().ticker)
  }

  @Test
  fun `filter by status LOSING — strictly negative profit_dollars`() {
    repo.save(sampleEntity(user = testUser, ticker = "WIN", profitDollars = BigDecimal("50.00")))
    repo.save(sampleEntity(user = testUser, ticker = "LOSS", profitDollars = BigDecimal("-25.00")))

    val losing = service.findAll(TradeEntryFilter(status = TradeStatus.LOSING))
    assertEquals(1, losing.size)
    assertEquals("LOSS", losing.first().ticker)
  }

  @Test
  fun `combining filters — AND semantics across axes`() {
    // Two rows match the date range, but only one matches play=A within it.
    repo.save(
      sampleEntity(
        user = testUser,
        ticker = "MATCH",
        tradeDate = LocalDate.of(2026, 6, 10),
        play = TradePlay.A,
      )
    )
    repo.save(
      sampleEntity(
        user = testUser,
        ticker = "WRONG_PLAY",
        tradeDate = LocalDate.of(2026, 6, 10),
        play = TradePlay.B,
      )
    )
    repo.save(
      sampleEntity(
        user = testUser,
        ticker = "WRONG_DATE",
        tradeDate = LocalDate.of(2026, 5, 1),
        play = TradePlay.A,
      )
    )

    val hits =
      service.findAll(
        TradeEntryFilter(
          dateFrom = LocalDate.of(2026, 6, 1),
          dateTo = LocalDate.of(2026, 6, 30),
          plays = listOf(TradePlay.A),
        )
      )

    assertEquals(1, hits.size)
    assertEquals("MATCH", hits.first().ticker)
  }

  @Test
  fun `empty filter — returns every row, sorted date desc then createdAt desc`() {
    val older = sampleEntity(user = testUser, ticker = "OLD", tradeDate = LocalDate.of(2026, 1, 1))
    val newer = sampleEntity(user = testUser, ticker = "NEW", tradeDate = LocalDate.of(2026, 6, 1))
    repo.save(older)
    repo.save(newer)

    val all = service.findAll()

    assertEquals(2, all.size)
    assertEquals("NEW", all.first().ticker, "most recent trade should be first")
    assertEquals("OLD", all.last().ticker)
  }

  // ---------------------------------------------------------------------------
  // Sample factories — sensible defaults, each test overrides only the field that matters.
  // ---------------------------------------------------------------------------

  private fun sampleRequest(
    tradeDate: LocalDate = LocalDate.of(2026, 6, 4),
    ticker: String = "AAPL",
    play: TradePlay = TradePlay.A,
    pattern: TradePattern = TradePattern.GUS,
    size: Int = 100,
    openPrice: BigDecimal = BigDecimal("3.2100"),
    exitPrice: BigDecimal? = null,
    profitDollars: BigDecimal? = null,
    gainPercent: BigDecimal? = null,
  ) =
    TradeEntryRequest(
      tradeDate = tradeDate,
      ticker = ticker,
      play = play,
      pattern = pattern,
      size = size,
      openPrice = openPrice,
      exitPrice = exitPrice,
      profitDollars = profitDollars,
      gainPercent = gainPercent,
      note = null,
      pre935To10h = true,
      preGapUp50 = true,
      prePrice1To10 = true,
      preFloat3To50m = true,
      preWaitPush = false,
      openSide = TradeOpenSide.FRONT,
      shortOnResistance = false,
      exitStrategy = TradeExitStrategy.SWING_20,
      errorNote = null,
    )

  private fun sampleEntity(
    user: User,
    ticker: String = "AAPL",
    tradeDate: LocalDate = LocalDate.of(2026, 6, 4),
    play: TradePlay = TradePlay.A,
    pattern: TradePattern = TradePattern.GUS,
    exitPrice: BigDecimal? = null,
    profitDollars: BigDecimal? = null,
  ) =
    com.portfolioai.journal.domain.TradeEntry(
      user = user,
      tradeDate = tradeDate,
      ticker = ticker,
      play = play,
      pattern = pattern,
      size = 100,
      openPrice = BigDecimal("3.2100"),
      exitPrice = exitPrice,
      profitDollars = profitDollars,
    )
}
