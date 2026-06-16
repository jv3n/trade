package com.portfolioai.account

import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.CorrectionRequest
import com.portfolioai.account.application.dto.MovementRequest
import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * End-to-end integration test on [AccountService] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap, no per-class plumbing).
 *
 * What it pins :
 * - **Sign convention + derived balance** — deposits store +, withdrawals store −, and the balance
 *   is the plain sum over a user's movements. Catches a regression in `signedAmount` or in the
 *   `balanceFor` aggregate query (incl. the `account_movement_type` Postgres ENUM mapping).
 * - **Balance correction** — the target-balance → signed `ADJUSTMENT` delta arithmetic, and the
 *   no-op (zero delta) guard.
 * - **TRADE read-only contract** — a movement pushed from the journal can't be created / edited /
 *   deleted through the manual endpoints (400).
 * - **Multi-tenant scope** — foreign / missing id → 404 (never 403), and summary / listing never
 *   reach across tenants.
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic — every test
 * seeds a fixed `testUser` and configures the mock to return it. A second user verifies isolation.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class AccountIntegrationTest {

  @Autowired private lateinit var service: AccountService
  @Autowired private lateinit var repo: AccountMovementRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    // Wipe in FK order : account_movement → trade_entry → app_user. The app_user cascade would
    // cover it, but explicit deletes keep the intent obvious and survive a previous failure.
    repo.deleteAll()
    tradeRepo.deleteAll()
    userRepository.deleteAll()
    testUser = userRepository.save(makeUser("trader"))
    otherUser = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  // ---------------------------------------------------------------------------
  // Sign convention + balance
  // ---------------------------------------------------------------------------

  @Test
  fun `deposit stores a positive amount, withdrawal a negative one`() {
    val deposit = service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))
    val withdrawal = service.addMovement(movement(AccountMovementType.WITHDRAWAL, "1500.00"))

    assertEquals(0, BigDecimal("5000.00").compareTo(deposit.amount), "deposit stored positive")
    assertEquals(
      0,
      BigDecimal("-1500.00").compareTo(withdrawal.amount),
      "withdrawal stored as a negative delta even though the request carries a positive magnitude",
    )
  }

  @Test
  fun `balance is the signed sum of deposits, withdrawals, trades and adjustments`() {
    service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))
    service.addMovement(movement(AccountMovementType.WITHDRAWAL, "1500.00"))
    seedTradeMovement(pnl = "300.00") // realized P&L pushed from the journal

    val summary = service.summary()

    assertEquals(0, BigDecimal("3800.00").compareTo(summary.balance), "5000 − 1500 + 300")
    assertEquals(0, BigDecimal("5000.00").compareTo(summary.totalDeposits))
    assertEquals(0, BigDecimal("-1500.00").compareTo(summary.totalWithdrawals))
    assertEquals(0, BigDecimal("3500.00").compareTo(summary.netInjected), "deposits + withdrawals")
    assertEquals(0, BigDecimal("300.00").compareTo(summary.tradesPnl))
    assertEquals(0, BigDecimal.ZERO.compareTo(summary.adjustments))
    assertEquals(3, summary.movementCount)
  }

  @Test
  fun `summary on an empty account is all zeros, not null`() {
    val summary = service.summary()
    assertEquals(0, BigDecimal.ZERO.compareTo(summary.balance))
    assertEquals(0, summary.movementCount)
  }

  // ---------------------------------------------------------------------------
  // Balance correction
  // ---------------------------------------------------------------------------

  @Test
  fun `correction records an ADJUSTMENT equal to target minus current balance`() {
    service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))
    // Real broker balance is 4 850 (50 of fees the journal never saw) → delta −150.
    val correction =
      service.correctBalance(CorrectionRequest(BigDecimal("4850.00"), LocalDate.of(2026, 6, 15)))

    assertEquals(AccountMovementType.ADJUSTMENT, correction.type)
    assertEquals(0, BigDecimal("-150.00").compareTo(correction.amount))
    assertEquals(
      0,
      BigDecimal("4850.00").compareTo(service.summary().balance),
      "balance now matches",
    )
  }

  @Test
  fun `correction to the current balance is rejected — no no-op row`() {
    service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.correctBalance(CorrectionRequest(BigDecimal("5000.00"), LocalDate.of(2026, 6, 15)))
      }
    assertEquals(400, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  @Test
  fun `a non-positive deposit amount is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.addMovement(movement(AccountMovementType.DEPOSIT, "0.00"))
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `adding a TRADE or ADJUSTMENT through the manual endpoint is a 400`() {
    val trade =
      assertThrows(ResponseStatusException::class.java) {
        service.addMovement(movement(AccountMovementType.TRADE, "100.00"))
      }
    assertEquals(400, trade.statusCode.value())

    val adjustment =
      assertThrows(ResponseStatusException::class.java) {
        service.addMovement(movement(AccountMovementType.ADJUSTMENT, "100.00"))
      }
    assertEquals(400, adjustment.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Edit / delete + TRADE read-only contract
  // ---------------------------------------------------------------------------

  @Test
  fun `editing a deposit re-applies the sign and bumps updatedAt`() {
    val created = service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))
    Thread.sleep(10) // let the next now() fall on a later instant

    val updated = service.update(created.id, movement(AccountMovementType.DEPOSIT, "5200.00"))

    assertEquals(0, BigDecimal("5200.00").compareTo(updated.amount))
    assertEquals(true, updated.updatedAt.isAfter(created.updatedAt))
  }

  @Test
  fun `changing a movement's type on edit is a 400`() {
    val created = service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(created.id, movement(AccountMovementType.WITHDRAWAL, "5000.00"))
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `a TRADE movement cannot be edited or deleted through the manual endpoints`() {
    val trade = seedTradeMovement(pnl = "300.00")

    val edit =
      assertThrows(ResponseStatusException::class.java) {
        service.update(trade.id, movement(AccountMovementType.TRADE, "300.00"))
      }
    assertEquals(400, edit.statusCode.value())

    val del = assertThrows(ResponseStatusException::class.java) { service.delete(trade.id) }
    assertEquals(400, del.statusCode.value())
  }

  @Test
  fun `delete removes a manual movement and a second delete is a 404`() {
    val created = service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))

    service.delete(created.id)
    assertNull(repo.findByIdAndUserId(created.id, testUser.id))

    val ex = assertThrows(ResponseStatusException::class.java) { service.delete(created.id) }
    assertEquals(404, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Multi-tenant scope
  // ---------------------------------------------------------------------------

  @Test
  fun `editing a foreign user's movement returns 404, not 403`() {
    val foreign =
      repo.save(
        AccountMovement(
          user = otherUser,
          type = AccountMovementType.DEPOSIT,
          amount = BigDecimal("999.00"),
          valueDate = LocalDate.of(2026, 6, 1),
        )
      )

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(foreign.id, movement(AccountMovementType.DEPOSIT, "10.00"))
      }
    assertEquals(404, ex.statusCode.value(), "must not leak existence — 404, never 403")
  }

  @Test
  fun `summary and listing never reach across tenants`() {
    repo.save(
      AccountMovement(
        user = otherUser,
        type = AccountMovementType.DEPOSIT,
        amount = BigDecimal("9999.00"),
        valueDate = LocalDate.of(2026, 6, 1),
      )
    )
    service.addMovement(movement(AccountMovementType.DEPOSIT, "5000.00"))

    assertEquals(
      0,
      BigDecimal("5000.00").compareTo(service.summary().balance),
      "only testUser's row",
    )
    val page = service.findAllPaged(PageRequest.of(0, 25))
    assertEquals(1, page.totalElements)
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

  private fun movement(
    type: AccountMovementType,
    amount: String,
    valueDate: LocalDate = LocalDate.of(2026, 6, 15),
    note: String? = null,
  ) = MovementRequest(type = type, amount = BigDecimal(amount), valueDate = valueDate, note = note)

  /**
   * Seeds a TRADE movement the way the journal-integration slice will : a real `trade_entry` row +
   * an `AccountMovement(type = TRADE, tradeEntryId = trade.id)`. The DB CHECK enforces the TRADE ⟺
   * tradeEntryId-present invariant, so this is the only valid way to create one.
   */
  private fun seedTradeMovement(pnl: String): AccountMovement {
    val trade =
      tradeRepo.save(
        TradeEntry(user = testUser, tradeDate = LocalDate.of(2026, 6, 15), ticker = "BAC")
      )
    return repo.save(
      AccountMovement(
        user = testUser,
        type = AccountMovementType.TRADE,
        amount = BigDecimal(pnl),
        valueDate = LocalDate.of(2026, 6, 15),
        tradeEntryId = trade.id,
      )
    )
  }
}
