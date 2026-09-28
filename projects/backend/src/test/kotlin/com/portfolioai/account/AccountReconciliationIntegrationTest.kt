package com.portfolioai.account

import com.portfolioai.account.application.AccountReconciliationService
import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.MovementRequest
import com.portfolioai.account.application.dto.ReconciliationDto
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
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * Pins how a change to a movement meets the reconciled mornings (#474, #476) — the rule that keeps
 * the balance the one figure the account page exists to get right.
 *
 * On morning D the broker showed a balance that already included every movement dated before D. A
 * change of δ to a movement dated d is absorbed by the first reconciled morning strictly after d
 * (its correction moves by −δ) ; with no such morning, the balance moves by δ.
 *
 * What it protects, scenario by scenario of #474 :
 * - **A** — an edit no longer swallows everything recorded since the last reconciliation : the cash
 *   added after the morning keeps counting, whatever row is edited.
 * - **B** — deleting a movement and re-creating it identically leaves every figure where it was.
 * - **D** — a correction never moves because of a movement dated on or after its morning, so a
 *   closed period's corrections stay put.
 * - The anchor is the morning : a clean morning gains a correction, a correction absorbed to zero
 *   goes and its morning stays.
 * - The gap tile reads the mornings' recorded gap, which no absorption moves (#480).
 * - What would make a morning lie is refused : editing its correction directly, or settling an
 *   earlier morning once a later one is recorded.
 *
 * The journal path (a trade's P&L) is pinned in [AccountTradeSyncIntegrationTest]. `AuthService` is
 * mocked so the user scope is deterministic.
 */
@SpringBootTest
class AccountReconciliationIntegrationTest {

  @Autowired private lateinit var service: AccountService
  @Autowired private lateinit var mornings: AccountReconciliationService
  @Autowired private lateinit var repo: AccountMovementRepository
  @Autowired private lateinit var reconciliationRepo: AccountReconciliationRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User

  @BeforeEach
  fun setUp() {
    reconciliationRepo.deleteAll()
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

  // ---------------------------------------------------------------------------
  // Scenario A — an edit swallowed everything since the last reconciliation
  // ---------------------------------------------------------------------------

  /**
   * The staging repro, scaled down : a one-dollar fix to an August deposit made 701 $ disappear,
   * because the latest correction was re-floated onto its whole target. The dollar belongs to the
   * morning that measured the deposit ; the cash added since has nothing to do with it.
   */
  @Test
  fun `fixing an earlier deposit leaves the cash added since the morning counting`() {
    val august = service.addMovement(deposit("2000.00", AUG_12))
    val morning = morning("1850.00", SEP_28) // 150 of fees : correction −150
    service.addMovement(deposit("500.00", SEP_28)) // real cash, after the morning

    service.update(august.id, deposit("2001.00", AUG_12))

    assertBalance("2350.00") // 1850 + 500 : the fix is absorbed, the 500 still counts
    assertAmount("-151.00", correctionOf(morning))
  }

  @Test
  fun `a change dated after the last morning moves the balance by exactly the change`() {
    service.addMovement(deposit("2000.00", AUG_12))
    val morning = morning("1850.00", SEP_28)
    val cash = service.addMovement(deposit("500.00", SEP_28))

    service.update(cash.id, deposit("600.00", SEP_28))

    assertBalance("2450.00")
    assertAmount("-150.00", correctionOf(morning))
  }

  // ---------------------------------------------------------------------------
  // Scenario B — delete then re-add left the account off
  // ---------------------------------------------------------------------------

  @Test
  fun `deleting a measured deposit and re-creating it leaves every figure where it was`() {
    val august = service.addMovement(deposit("150.00", AUG_12))
    service.addMovement(deposit("2000.00", AUG_12))
    val morning = morning("2100.00", SEP_28) // correction −50

    service.delete(august.id)
    assertBalance("2100.00") // the morning measured it : its correction absorbs the delete
    service.addMovement(deposit("150.00", AUG_12))

    assertBalance("2100.00")
    assertAmount("-50.00", correctionOf(morning))
    assertEquals(1, adjustmentCount(), "the round trip left no phantom correction (scenario C)")
  }

  @Test
  fun `deleting a deposit of the morning's own day and re-creating it leaves every figure where it was`() {
    service.addMovement(deposit("2000.00", AUG_12))
    val morning = morning("1950.00", SEP_28) // correction −50
    val sameDay = service.addMovement(deposit("150.00", SEP_28))

    service.delete(sameDay.id)
    assertBalance("1950.00") // a row of day D happens after that morning : it moves the balance
    service.addMovement(deposit("150.00", SEP_28))

    assertBalance("2100.00")
    assertAmount("-50.00", correctionOf(morning))
    assertEquals(1, adjustmentCount(), "the round trip left no phantom correction (scenario C)")
  }

  // ---------------------------------------------------------------------------
  // Scenario D — a past period's figures changed retroactively
  // ---------------------------------------------------------------------------

  @Test
  fun `a correction never moves because of a movement dated after its morning`() {
    service.addMovement(deposit("2000.00", AUG_12))
    val august = morning("2032.10", AUG_25) // correction +32.10
    val september = service.addMovement(deposit("1000.00", SEP_01))
    val lateSeptember = morning("2900.00", SEP_28) // correction −132.10
    val augustAdjustments = adjustmentsOf(AUG_01, AUG_31)

    service.update(september.id, deposit("1150.00", SEP_01))

    assertAmount("32.10", correctionOf(august))
    assertAmount("-282.10", correctionOf(lateSeptember)) // the first morning after it absorbs
    assertEquals(0, augustAdjustments.compareTo(adjustmentsOf(AUG_01, AUG_31)), "August unchanged")
    assertBalance("2900.00")
  }

  @Test
  fun `only the first morning after the edited row absorbs it`() {
    val deposit = service.addMovement(deposit("2000.00", AUG_12))
    val august = morning("2032.10", AUG_25)
    val september = morning("2000.00", SEP_28)

    service.update(deposit.id, deposit("2010.00", AUG_12))

    assertAmount("22.10", correctionOf(august))
    assertAmount("-32.10", correctionOf(september), "the later morning was not touched")
    assertBalance("2000.00")
  }

  @Test
  fun `moving a movement to another date moves it from one morning to the other`() {
    service.addMovement(deposit("2000.00", AUG_12))
    val august = morning("2000.00", AUG_25) // clean
    val cash = service.addMovement(deposit("100.00", SEP_01))
    val september = morning("2100.00", SEP_28) // clean

    // It was really received in August : August's morning had it, September's did not see it
    // arrive.
    service.update(cash.id, deposit("100.00", AUG_12))

    assertAmount("-100.00", correctionOf(august))
    assertAmount("100.00", correctionOf(september))
    assertBalance("2100.00")
  }

  // ---------------------------------------------------------------------------
  // The anchor is the morning
  // ---------------------------------------------------------------------------

  @Test
  fun `a clean morning gains a correction when an earlier row is fixed`() {
    val deposit = service.addMovement(deposit("2000.00", AUG_12))
    val clean = morning("2000.00", SEP_28)
    assertNull(clean.correctionId)

    service.update(deposit.id, deposit("2012.40", AUG_12))

    assertAmount("-12.40", correctionOf(clean))
    assertBalance("2000.00")
  }

  @Test
  fun `a correction absorbed down to zero goes, and its morning stays`() {
    val deposit = service.addMovement(deposit("2000.00", AUG_12))
    val settled = morning("2012.40", SEP_28) // correction +12.40 : the deposit was mistyped

    service.update(deposit.id, deposit("2012.40", AUG_12))

    val after = reconciliationRepo.findById(settled.id).orElseThrow()
    assertNull(after.correctionId, "the morning reads clean : its gap is explained")
    assertEquals(
      0,
      repo.findByUserId(testUser.id).count { it.type == AccountMovementType.ADJUSTMENT },
    )
    assertBalance("2012.40")
  }

  @Test
  fun `cancelling an earlier morning is absorbed by the next one`() {
    service.addMovement(deposit("2000.00", AUG_12))
    val august = morning("2032.10", AUG_25)
    val september = morning("2000.00", SEP_28) // correction −32.10

    mornings.cancel(august.id)

    assertAmount("0.00", correctionOf(september), "September's balance was a fact : it stays")
    assertBalance("2000.00")
  }

  @Test
  fun `a correction without a morning never absorbs anything`() {
    val deposit = service.addMovement(deposit("1000.00", AUG_12))
    // Pre-#198 shape : an ADJUSTMENT no morning points at.
    repo.save(
      AccountMovement(
        user = testUser,
        type = AccountMovementType.ADJUSTMENT,
        amount = BigDecimal("-50.00"),
        valueDate = SEP_28,
      )
    )

    service.delete(deposit.id)

    assertBalance("-50.00")
  }

  // What the movements table reads to mark a correction that absorbed a fix (#477).
  @Test
  fun `the listing carries the gap a morning measured next to its correction`() {
    val august = service.addMovement(deposit("2000.00", AUG_12))
    val settled = morning("1850.00", SEP_28)
    service.update(august.id, deposit("2001.00", AUG_12))

    val rows = service.findAllPaged(AccountMovementFilter(), PageRequest.of(0, 25)).content

    val correction = rows.single { it.id == settled.correctionId }
    assertAmount("-150.00", correction.measuredGap!!, "what the morning measured")
    assertAmount("-151.00", correction.amount, "what it holds after absorbing the fix")
    assertNull(
      rows.single { it.id == august.id }.measuredGap,
      "only a morning's correction has one",
    )
  }

  /**
   * The false positive #477 has to avoid : fixing a mistyped figure moves the correction, and
   * nothing was absorbed. It holds because a re-settle measures its gap from where the morning
   * started (`appBalance`), so gap and correction land on the same figure.
   */
  @Test
  fun `re-settling a mistyped morning keeps its correction equal to the gap it measured`() {
    service.addMovement(deposit("2000.00", AUG_12))
    morning("1985.00", SEP_28) // typo
    val settled = morning("1850.00", SEP_28)

    val rows = service.findAllPaged(AccountMovementFilter(), PageRequest.of(0, 25)).content

    val correction = rows.single { it.id == settled.correctionId }
    assertAmount("-150.00", correction.amount)
    assertAmount("-150.00", correction.measuredGap!!, "not tagged as adjusted")
  }

  // ---------------------------------------------------------------------------
  // The gap tile reads what the mornings measured (#480)
  // ---------------------------------------------------------------------------

  @Test
  fun `the period's gap is what its mornings measured, and an absorbed fix does not move it`() {
    val august = service.addMovement(deposit("2000.00", AUG_12))
    morning("1850.00", SEP_28)

    service.update(august.id, deposit("2001.00", AUG_12))

    val september = service.summary(AccountMovementFilter(SEP_01, SEP_30))
    assertAmount("-150.00", september.periodReconciliationGap!!, "what the broker took")
    assertAmount("-151.00", september.periodAdjustments, "the correction holds the fix too")
  }

  @Test
  fun `a period with no reconciled morning has no gap figure`() {
    service.addMovement(deposit("2000.00", AUG_12))
    morning("1850.00", SEP_28)

    assertNull(service.summary(AccountMovementFilter(AUG_01, AUG_31)).periodReconciliationGap)
  }

  @Test
  fun `a clean morning counts as a measured zero, not as no figure`() {
    service.addMovement(deposit("2000.00", AUG_12))
    morning("2000.00", SEP_28)

    assertAmount(
      "0.00",
      service.summary(AccountMovementFilter(SEP_01, SEP_30)).periodReconciliationGap!!,
    )
  }

  @Test
  fun `a correction without a morning is not counted in the gap`() {
    service.addMovement(deposit("2000.00", AUG_12))
    morning("2000.00", SEP_28)
    repo.save(
      AccountMovement(
        user = testUser,
        type = AccountMovementType.ADJUSTMENT,
        amount = BigDecimal("-50.00"),
        valueDate = SEP_01,
      )
    )

    val september = service.summary(AccountMovementFilter(SEP_01, SEP_30))
    assertAmount("0.00", september.periodReconciliationGap!!)
    assertAmount("-50.00", september.periodAdjustments)
  }

  // ---------------------------------------------------------------------------
  // What would make a morning lie — refused
  // ---------------------------------------------------------------------------

  // Its morning would keep a broker balance and a gap the ledger no longer shows.
  @Test
  fun `a morning's correction is not edited directly`() {
    service.addMovement(deposit("2000.00", AUG_12))
    val settled = morning("1850.00", SEP_28)

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(
          settled.correctionId!!,
          MovementRequest(AccountMovementType.ADJUSTMENT, BigDecimal("-100.00"), SEP_28, null),
        )
      }

    assertEquals(400, ex.statusCode.value())
    assertAmount("-150.00", correctionOf(settled))
    assertBalance("1850.00")
  }

  // The panel always settles today ; a past morning settled late would move the balance under the
  // later one without it absorbing anything.
  @Test
  fun `an earlier morning is not settled once a later one is recorded`() {
    service.addMovement(deposit("2000.00", AUG_12))
    morning("2000.00", SEP_28)

    val ex = assertThrows(ResponseStatusException::class.java) { morning("1950.00", AUG_25) }

    assertEquals(400, ex.statusCode.value())
    assertEquals(1, reconciliationRepo.count())
    assertEquals(0, adjustmentCount())
    assertBalance("2000.00")
  }

  // ---------------------------------------------------------------------------

  private fun morning(brokerBalance: String, date: LocalDate): ReconciliationDto =
    mornings.reconcile(ReconciliationRequest(BigDecimal(brokerBalance), date))

  /** The morning's correction amount as it stands now, 0 on a clean morning. */
  private fun correctionOf(morning: ReconciliationDto): BigDecimal =
    reconciliationRepo.findById(morning.id).orElseThrow().correctionId?.let {
      repo.findById(it).orElseThrow().amount
    } ?: BigDecimal.ZERO

  private fun adjustmentsOf(from: LocalDate, to: LocalDate): BigDecimal =
    service.summary(AccountMovementFilter(dateFrom = from, dateTo = to)).periodAdjustments

  private fun adjustmentCount(): Int =
    repo.findByUserId(testUser.id).count { it.type == AccountMovementType.ADJUSTMENT }

  private fun assertBalance(expected: String) {
    val balance = service.summary(AccountMovementFilter()).balance
    assertEquals(0, BigDecimal(expected).compareTo(balance), "balance $balance, expected $expected")
  }

  private fun assertAmount(expected: String, actual: BigDecimal, message: String? = null) {
    assertNotNull(actual)
    assertEquals(
      0,
      BigDecimal(expected).compareTo(actual),
      message ?: "got $actual, expected $expected",
    )
  }

  private fun deposit(amount: String, date: LocalDate) =
    MovementRequest(AccountMovementType.DEPOSIT, BigDecimal(amount), date, null)

  private companion object {
    val AUG_01: LocalDate = LocalDate.of(2026, 8, 1)
    val AUG_12: LocalDate = LocalDate.of(2026, 8, 12)
    val AUG_25: LocalDate = LocalDate.of(2026, 8, 25)
    val AUG_31: LocalDate = LocalDate.of(2026, 8, 31)
    val SEP_01: LocalDate = LocalDate.of(2026, 9, 1)
    val SEP_28: LocalDate = LocalDate.of(2026, 9, 28)
    val SEP_30: LocalDate = LocalDate.of(2026, 9, 30)
  }
}
