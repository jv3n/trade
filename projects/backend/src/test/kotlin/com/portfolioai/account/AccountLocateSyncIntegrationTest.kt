package com.portfolioai.account

import com.portfolioai.account.application.AccountReconciliationService
import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.MovementRequest
import com.portfolioai.account.application.dto.ReconciliationRequest
import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementFilter
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.account.infrastructure.persistence.AccountReconciliationRepository
import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.locate.application.LocateService
import com.portfolioai.locate.application.dto.LocateRequest
import com.portfolioai.locate.application.dto.LocateUpdateRequest
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
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
import org.springframework.web.server.ResponseStatusException

/**
 * Pins the locate → account integration of #606 : a locate's cost lands in the ledger as a
 * read-only `LOCATE` movement, kept in step with the locate, and the account summary reads the
 * period's locates and the part of them **paid for nothing**.
 *
 * Drives the real [LocateService] and asserts on the `account_movement` rows — the event, the
 * synchronous listener, `AccountLocateSyncService`'s upsert and the reconciler, against real
 * Postgres. What it protects :
 * - **The line follows the locate** — created, corrected, deleted ; −(shares × price), dated the
 *   locate's day, labelled with its ticker and shares.
 * - **Read-only on the account** — the manual endpoints refuse to add, edit or delete one.
 * - **A reconciled morning stays true** (#476) — a locate dated before it is absorbed there.
 * - **Paid for nothing** — no trade on that (day, ticker), today's counted once New York closed.
 *
 * `AuthService` is mocked for the user scope, `Clock` to place « now » around the 16:00 close.
 */
@SpringBootTest
class AccountLocateSyncIntegrationTest {

  @Autowired private lateinit var locates: LocateService
  @Autowired private lateinit var trades: TradeEntryService
  @Autowired private lateinit var accountService: AccountService
  @Autowired private lateinit var accountRepo: AccountMovementRepository
  @Autowired private lateinit var reconciliationService: AccountReconciliationService
  @Autowired private lateinit var reconciliationRepo: AccountReconciliationRepository
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService
  @MockitoBean private lateinit var clock: Clock

  private lateinit var testUser: User

  @BeforeEach
  fun setUp() {
    reconciliationRepo.deleteAll()
    accountRepo.deleteAll()
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
    whenever(authService.getCurrentUser()).thenReturn(testUser)
    whenever(clock.instant()).thenReturn(AFTER_THE_CLOSE)
  }

  @Test
  fun `a locate lands as a read-only expense, labelled with its ticker and shares`() {
    val locate = locates.create(locateOn(ticker = "SGBX", shares = 2000, price = "0.12"))

    val line = locateLines().single()
    assertAmount("-240.00", line.amount)
    assertEquals(DAY, line.valueDate)
    assertEquals("SGBX", line.note)
    assertEquals("SGBX", line.locateTicker)
    assertEquals(2000, line.locateShares)
    assertEquals(locate.id, line.locateId)
  }

  @Test
  fun `correcting the locate moves its line, deleting it takes the line away`() {
    val locate = locates.create(locateOn(ticker = "VERB", shares = 1000))

    locates.update(
      locate.id,
      LocateUpdateRequest(shares = 1500, pricePerShare = BigDecimal("0.04")),
    )
    val corrected = locateLines().single()
    assertAmount("-60.00", corrected.amount)
    assertEquals(1500, corrected.locateShares)

    locates.delete(locate.id)
    assertTrue(locateLines().isEmpty())
    assertBalance("0.00")
  }

  // A zero amount would break the `account_movement` CHECK : like a break-even trade, nothing
  // moved.
  @Test
  fun `a locate charged nothing leaves no line`() {
    locates.create(locateOn(price = "0"))

    assertTrue(locateLines().isEmpty())
  }

  @Test
  fun `a locate typed for a day before a reconciled morning is absorbed by that morning`() {
    accountService.addMovement(
      MovementRequest(AccountMovementType.DEPOSIT, BigDecimal("1000.00"), DAY.minusDays(1))
    )
    val morning =
      reconciliationService.reconcile(ReconciliationRequest(BigDecimal("950.00"), DAY.plusDays(1)))

    locates.create(locateOn(shares = 1000, price = "0.05"))

    assertBalance("950.00")
    assertNull(
      reconciliationRepo.findById(morning.id).orElseThrow().correctionId,
      "the −50 gap is explained by the locate, the morning reads clean",
    )
  }

  @Test
  fun `the account's manual endpoints refuse to add, edit or delete a locate's line`() {
    locates.create(locateOn())
    val line = locateLines().single()
    val request = MovementRequest(AccountMovementType.LOCATE, BigDecimal("10.00"), DAY)

    listOf(
        { accountService.addMovement(request) },
        { accountService.update(line.id, request) },
        { accountService.delete(line.id) },
      )
      .forEach { call ->
        assertEquals(
          HttpStatus.BAD_REQUEST,
          assertThrows<ResponseStatusException> { call() }.statusCode,
        )
      }
    assertAmount("-50.00", locateLines().single().amount)
  }

  @Test
  fun `the summary sums the period's locates and the part on a ticker not traded that day`() {
    locates.create(locateOn(ticker = "SGBX", shares = 2000, price = "0.05"))
    locates.create(locateOn(ticker = "MLGO", shares = 1000, price = "0.03"))
    trade("SGBX")

    val summary = accountService.summary(AccountMovementFilter(DAY, DAY))

    assertAmount("-130.00", summary.periodLocates)
    assertAmount("-30.00", summary.periodUnusedLocates)
  }

  @Test
  fun `today's locate is not paid for nothing before New York has closed`() {
    locates.create(locateOn(ticker = "MLGO", shares = 1000, price = "0.03"))

    whenever(clock.instant()).thenReturn(BEFORE_THE_CLOSE)
    assertAmount("0", accountService.summary(AccountMovementFilter()).periodUnusedLocates)

    whenever(clock.instant()).thenReturn(AFTER_THE_CLOSE)
    assertAmount("-30.00", accountService.summary(AccountMovementFilter()).periodUnusedLocates)
  }

  // Under « Trades » a tile following the type filter would read a plausible 0.
  @Test
  fun `the locate figures follow the dates, not the type filter`() {
    locates.create(locateOn(shares = 1000, price = "0.05"))

    val underTrades =
      accountService.summary(AccountMovementFilter(types = listOf(AccountMovementType.TRADE)))

    assertAmount("-50.00", underTrades.periodLocates)
    assertAmount("-50.00", underTrades.periodUnusedLocates)
    assertAmount("0", accountService.summary(AccountMovementFilter(DAY.plusDays(1))).periodLocates)
  }

  // ---------------------------------------------------------------------------

  private fun locateOn(ticker: String = "ATXG", shares: Int = 1000, price: String = "0.05") =
    LocateRequest(
      shares = shares,
      tradingDate = DAY,
      ticker = ticker,
      pricePerShare = BigDecimal(price),
    )

  /** An open trade on [ticker] that day — enough for the journal to say it was traded. */
  private fun trade(ticker: String) {
    val stat =
      statRepo.save(
        StatEntry(
          user = testUser,
          tradeDate = DAY,
          ticker = ticker,
          previousClose = BigDecimal("1.12"),
          pmOpen = BigDecimal("1.85"),
          pmHigh = BigDecimal("2.46"),
        )
      )
    trades.create(TradeEntryRequest(statEntryId = stat.id, tradeDate = DAY, ticker = ticker))
  }

  private fun locateLines(): List<AccountMovement> =
    accountRepo.findByUserId(testUser.id).filter { it.type == AccountMovementType.LOCATE }

  private fun assertBalance(expected: String) =
    assertAmount(expected, accountService.summary(AccountMovementFilter()).balance)

  private fun assertAmount(expected: String, actual: BigDecimal) {
    assertEquals(0, BigDecimal(expected).compareTo(actual), "got $actual, expected $expected")
  }

  private companion object {
    val DAY: LocalDate = LocalDate.of(2026, 9, 18)

    // New York is on EDT (UTC−4) in September : the close is 20:00 UTC.
    val BEFORE_THE_CLOSE: Instant = Instant.parse("2026-09-18T19:59:00Z")
    val AFTER_THE_CLOSE: Instant = Instant.parse("2026-09-18T20:00:00Z")
  }
}
