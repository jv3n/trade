package com.portfolioai.account

import com.portfolioai.account.application.AccountReconciliationService
import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.MovementRequest
import com.portfolioai.account.application.dto.ReconciliationRequest
import com.portfolioai.account.domain.AccountMovementFilter
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.account.infrastructure.persistence.AccountReconciliationRepository
import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Pins the morning reconciliation (#198) — the daily ritual that settles the app's derived balance
 * against the one TradeZero displays.
 *
 * What it protects :
 * - **A clean morning leaves a trace.** That is the whole reason this slice exists : before it, a
 *   gap-free reconciliation wrote nothing, so "reconciled today ?" had no answer and the history
 *   had holes on exactly the good days.
 * - **A gap is absorbed by one correction**, the balance lands on the broker's figure, and the
 *   reconciliation keeps that movement's id so the history can show what it cost.
 * - **One row per morning** — re-settling the same day overwrites the decision instead of stacking
 *   two lines, and the second pass compares against the balance as it stands then.
 * - **The history reads latest-first** and never crosses tenants.
 *
 * `AuthService` is mocked so the user scope is deterministic (mirrors [AccountIntegrationTest]).
 */
@SpringBootTest
class MorningReconciliationIntegrationTest {

  @Autowired private lateinit var service: AccountReconciliationService
  @Autowired private lateinit var accountService: AccountService
  @Autowired private lateinit var movements: AccountMovementRepository
  @Autowired private lateinit var repo: AccountReconciliationRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    movements.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  @Test
  fun `a gap-free morning is timestamped and moves nothing`() {
    accountService.addMovement(deposit("1000.00"))

    val settled = service.reconcile(ReconciliationRequest(BigDecimal("1000.00"), MONDAY))

    assertEquals(0, BigDecimal.ZERO.compareTo(settled.gap), "the two figures agree")
    assertNull(settled.correctionId, "nothing to correct")
    assertNotNull(settled.reconciledAt, "the morning is timestamped all the same")
    assertEquals(1, movements.findByUserId(testUser.id).size, "only the deposit — no plug")
  }

  @Test
  fun `a gap records one correction and lands the balance on the broker figure`() {
    accountService.addMovement(deposit("1000.00"))

    // TradeZero shows 987.60 : 12.40 of borrow fees the app never saw.
    val settled = service.reconcile(ReconciliationRequest(BigDecimal("987.60"), MONDAY))

    assertEquals(0, BigDecimal("-12.40").compareTo(settled.gap))
    assertEquals(0, BigDecimal("1000.00").compareTo(settled.appBalance), "the figures compared")
    assertNotNull(settled.correctionId, "the gap left an auditable line")
    assertEquals(
      0,
      BigDecimal("987.60").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )
    val adjustments =
      movements.findByUserId(testUser.id).filter { it.type == AccountMovementType.ADJUSTMENT }
    assertEquals(1, adjustments.size)
    assertEquals(settled.correctionId, adjustments.single().id)
  }

  @Test
  fun `re-settling the same morning overwrites it instead of stacking a second line`() {
    accountService.addMovement(deposit("1000.00"))
    service.reconcile(ReconciliationRequest(BigDecimal("987.60"), MONDAY)) // typo : 12.40 too low

    // Read the statement again : it actually says 995.00.
    val corrected = service.reconcile(ReconciliationRequest(BigDecimal("995.00"), MONDAY))

    assertEquals(1, service.history(10).size, "one morning, one row")
    assertEquals(
      0,
      BigDecimal("995.00").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )
    // The morning is still remembered from where it started (1000), not from the 987.60 the first
    // pass left behind : that day cost 5, not 5 on top of a forgotten 12.40.
    assertEquals(0, BigDecimal("1000.00").compareTo(corrected.appBalance))
    assertEquals(0, BigDecimal("-5.00").compareTo(corrected.gap))
  }

  @Test
  fun `a morning re-settled on the same figure keeps its correction, not a clean tick`() {
    accountService.addMovement(deposit("1000.00"))
    val corrected = service.reconcile(ReconciliationRequest(BigDecimal("987.60"), MONDAY))
    assertNotNull(corrected.correctionId)

    // Same figure again : the balance already sits there, nothing more to absorb.
    val settled = service.reconcile(ReconciliationRequest(BigDecimal("987.60"), MONDAY))

    assertEquals(0, BigDecimal("-12.40").compareTo(settled.gap), "the morning still cost 12.40")
    assertEquals(corrected.correctionId, settled.correctionId, "its line is still in the ledger")
    assertEquals(
      1,
      movements.findByUserId(testUser.id).count { it.type == AccountMovementType.ADJUSTMENT },
      "and no second plug was added",
    )
  }

  @Test
  fun `the history reads latest-first, clean and corrected mornings alike`() {
    accountService.addMovement(deposit("1000.00"))
    service.reconcile(ReconciliationRequest(BigDecimal("1000.00"), MONDAY))
    service.reconcile(ReconciliationRequest(BigDecimal("980.00"), TUESDAY)) // −20
    service.reconcile(ReconciliationRequest(BigDecimal("980.00"), WEDNESDAY))

    val history = service.history(10)

    assertEquals(listOf(WEDNESDAY, TUESDAY, MONDAY), history.map { it.valueDate })
    assertEquals(0, BigDecimal("-20.00").compareTo(history[1].gap), "Tuesday cost 20")
    assertTrue(history[0].gap.signum() == 0 && history[2].gap.signum() == 0)
  }

  @Test
  fun `the history never crosses tenants`() {
    val other = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(other)
    service.reconcile(ReconciliationRequest(BigDecimal("500.00"), MONDAY))

    whenever(authService.getCurrentUser()).thenReturn(testUser)

    assertTrue(service.history(10).isEmpty(), "the other trader's morning stays theirs")
  }

  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Cancelling a morning (#249)
  // ---------------------------------------------------------------------------

  /**
   * The mistyped-figure path. Re-posting the same day *corrects* a morning ; cancelling *erases* it
   * — the correction goes, and the balance returns to where it stood before that morning.
   */
  @Test
  fun `cancelling a morning removes its correction and puts the balance back`() {
    accountService.addMovement(deposit("1000.00"))
    // A fat-fingered broker balance : 9 870 instead of 987.
    val settled = service.reconcile(ReconciliationRequest(BigDecimal("9870.00"), MONDAY))
    assertNotNull(settled.correctionId)
    assertEquals(
      0,
      BigDecimal("9870.00").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )

    service.cancel(settled.id)

    assertEquals(
      0,
      BigDecimal("1000.00").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )
    assertNull(movements.findById(settled.correctionId!!).orElse(null))
    assertTrue(service.history(10).isEmpty())
  }

  @Test
  fun `the same morning can be settled again right after being cancelled`() {
    accountService.addMovement(deposit("1000.00"))
    val mistyped = service.reconcile(ReconciliationRequest(BigDecimal("9870.00"), MONDAY))

    service.cancel(mistyped.id)
    val corrected = service.reconcile(ReconciliationRequest(BigDecimal("987.60"), MONDAY))

    assertEquals(1, service.history(10).size)
    // The gap is measured from the untouched balance, not from the cancelled morning's figure.
    assertEquals(0, BigDecimal("-12.40").compareTo(corrected.gap))
    assertEquals(
      0,
      BigDecimal("987.60").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )
  }

  /**
   * The other half of #249 : deleting the `ADJUSTMENT` straight from the movements table used to
   * leave the morning behind (the FK is `ON DELETE SET NULL`), and the block then refused a new
   * entry for that day while describing a correction that no longer existed.
   */
  @Test
  fun `deleting the correction on its own takes its morning with it`() {
    accountService.addMovement(deposit("1000.00"))
    val settled = service.reconcile(ReconciliationRequest(BigDecimal("987.60"), MONDAY))

    accountService.delete(settled.correctionId!!)

    assertTrue(service.history(10).isEmpty())
    assertEquals(
      0,
      BigDecimal("1000.00").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )
  }

  @Test
  fun `cancelling a clean morning leaves the balance alone`() {
    accountService.addMovement(deposit("1000.00"))
    val clean = service.reconcile(ReconciliationRequest(BigDecimal("1000.00"), MONDAY))
    assertNull(clean.correctionId)

    service.cancel(clean.id)

    assertTrue(service.history(10).isEmpty())
    assertEquals(
      0,
      BigDecimal("1000.00").compareTo(accountService.summary(AccountMovementFilter()).balance),
    )
  }

  private fun saveUser(prefix: String) =
    userRepository.save(
      User(
        email = "$prefix-${UUID.randomUUID()}@test.local",
        displayName = "Trader",
        provider = "test",
        providerId = null,
        role = Role.USER,
      )
    )

  private fun deposit(amount: String) =
    MovementRequest(
      type = AccountMovementType.DEPOSIT,
      amount = BigDecimal(amount),
      valueDate = MONDAY,
      note = null,
    )

  private companion object {
    val MONDAY: LocalDate = LocalDate.of(2026, 9, 14)
    val TUESDAY: LocalDate = LocalDate.of(2026, 9, 15)
    val WEDNESDAY: LocalDate = LocalDate.of(2026, 9, 16)
  }
}
