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
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Pins the **floating-correction** behaviour (fix for the "account totals drift after editing /
 * deleting a line" bug). A balance correction records the target the user reconciled to ; the
 * latest such correction is re-floated so the derived balance keeps matching that target whenever
 * another line is edited or deleted — while a brand-new deposit / withdrawal still moves the
 * balance.
 *
 * What it protects :
 * - **Delete re-floats** — removing a line the correction was papering over keeps the balance on
 *   the target instead of leaving the frozen delta behind (the original bug's repro).
 * - **Edit re-floats** — same, when the line's amount changes.
 * - **Add does *not* re-float** — fresh cash is a real move, not a mistake to absorb.
 * - **Plug reaches zero → the adjustment is deleted** (a zero row would break the CHECK).
 * - **Deleting the latest correction** falls back to the previous one's target.
 * - **Legacy adjustments (null target) stay frozen** — no silent rewrite of pre-migration rows.
 *
 * `AuthService` is mocked so the user-scope is deterministic (mirrors [AccountIntegrationTest]).
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class AccountReconciliationIntegrationTest {

  @Autowired private lateinit var service: AccountService
  @Autowired private lateinit var repo: AccountMovementRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
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
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  @Test
  fun `deleting the line a correction covered keeps the balance on the target`() {
    val deposit = service.addMovement(deposit("1000.00"))
    // Broker really shows 950 (50 of fees) → ADJUSTMENT −50, balance 950.
    service.correctBalance(CorrectionRequest(BigDecimal("950.00"), VALUE_DATE))

    service.delete(deposit.id)

    // The old bug left the frozen −50 → balance −50. Now the correction re-floats to hold 950.
    assertEquals(0, BigDecimal("950.00").compareTo(service.summary().balance))
    assertEquals(0, BigDecimal("950.00").compareTo(theAdjustment().amount), "plug re-floated")
  }

  @Test
  fun `editing a line the correction covered keeps the balance on the target`() {
    val deposit = service.addMovement(deposit("1000.00"))
    service.correctBalance(CorrectionRequest(BigDecimal("950.00"), VALUE_DATE)) // adj −50

    service.update(deposit.id, deposit("1200.00"))

    assertEquals(0, BigDecimal("950.00").compareTo(service.summary().balance), "still on target")
    assertEquals(0, BigDecimal("-250.00").compareTo(theAdjustment().amount), "1200 − 250 = 950")
  }

  @Test
  fun `adding a new deposit after a correction still moves the balance`() {
    service.addMovement(deposit("1000.00"))
    service.correctBalance(CorrectionRequest(BigDecimal("950.00"), VALUE_DATE)) // adj −50

    service.addMovement(deposit("500.00"))

    // Fresh cash is a real move — the correction does NOT absorb it.
    assertEquals(0, BigDecimal("1450.00").compareTo(service.summary().balance), "1000 + 500 − 50")
    assertEquals(0, BigDecimal("-50.00").compareTo(theAdjustment().amount), "adjustment untouched")
  }

  @Test
  fun `an edit that makes the plug zero drops the adjustment row entirely`() {
    val deposit = service.addMovement(deposit("1000.00"))
    service.correctBalance(CorrectionRequest(BigDecimal("950.00"), VALUE_DATE)) // adj −50

    // Edit the deposit down to the target itself → the plug would be 0, which the CHECK forbids.
    service.update(deposit.id, deposit("950.00"))

    val summary = service.summary()
    assertEquals(0, BigDecimal("950.00").compareTo(summary.balance))
    assertEquals(
      0,
      BigDecimal.ZERO.compareTo(summary.adjustments),
      "adjustment removed, not left at 0",
    )
    assertEquals(1, summary.movementCount, "only the deposit remains")
  }

  @Test
  fun `deleting the latest correction falls back to the previous target`() {
    service.addMovement(deposit("1000.00"))
    service.correctBalance(CorrectionRequest(BigDecimal("950.00"), VALUE_DATE)) // adj1, target 950
    Thread.sleep(10) // ensure adj2 sorts after adj1 (created_at ordering picks the latest anchor)
    val second =
      service.correctBalance(
        CorrectionRequest(BigDecimal("900.00"), VALUE_DATE)
      ) // adj2, target 900
    assertEquals(0, BigDecimal("900.00").compareTo(service.summary().balance))

    service.delete(second.id)

    // adj1 becomes the anchor again → balance snaps back to its 950 target.
    assertEquals(0, BigDecimal("950.00").compareTo(service.summary().balance))
  }

  @Test
  fun `a legacy adjustment without a target stays frozen when a line is deleted`() {
    val deposit = service.addMovement(deposit("1000.00"))
    // Pre-migration shape : an ADJUSTMENT with no target_balance. Must not be re-floated.
    repo.save(
      AccountMovement(
        user = testUser,
        type = AccountMovementType.ADJUSTMENT,
        amount = BigDecimal("-50.00"),
        valueDate = VALUE_DATE,
        targetBalance = null,
      )
    )

    service.delete(deposit.id)

    assertEquals(
      0,
      BigDecimal("-50.00").compareTo(service.summary().balance),
      "legacy delta is left exactly as-is",
    )
  }

  // ---------------------------------------------------------------------------

  private fun theAdjustment(): AccountMovement =
    repo.findByUserId(testUser.id).single { it.type == AccountMovementType.ADJUSTMENT }

  private fun deposit(amount: String) =
    MovementRequest(AccountMovementType.DEPOSIT, BigDecimal(amount), VALUE_DATE, null)

  private companion object {
    val VALUE_DATE: LocalDate = LocalDate.of(2026, 6, 15)
  }
}
