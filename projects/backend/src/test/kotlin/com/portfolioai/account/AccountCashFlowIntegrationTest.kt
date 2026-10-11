package com.portfolioai.account

import com.portfolioai.account.application.AccountCashFlowService
import com.portfolioai.account.application.dto.CashFlowDto
import com.portfolioai.account.domain.AccountMovement
import com.portfolioai.account.domain.AccountMovementFilter
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.domain.CashFlowBucketSize
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.domain.TradeEntry
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.locate.domain.Locate
import com.portfolioai.locate.infrastructure.persistence.LocateRepository
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
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
 * The « Flux du compte » report (#685, #694) on a real PostgreSQL — the aggregate is SQL
 * (`date_trunc`, `generate_series`, `FILTER`), so only the database can say it is right.
 *
 * What it pins :
 * - **Every bucket of the period is there** — a week with no movement comes back at zero, never
 *   skipped ; a week starts on Monday ; the first and last buckets are clipped to the period's
 *   days.
 * - **The series** — trades split into winners and losers by sign, locates, deposits, withdrawals
 *   and adjustments apart, and a net that adds them up.
 * - **The filter** — movements outside the dates are left out ; the type filter empties the series
 *   it excludes, but never the balances, which are the whole account's.
 * - **Open bounds** — « all time » starts at the first movement and ends at the last.
 * - **Scope and guards** — another user's movements are never counted ; an inverted period or a
 *   bucket too narrow for it is a 400.
 */
@SpringBootTest
class AccountCashFlowIntegrationTest {

  @Autowired private lateinit var service: AccountCashFlowService
  @Autowired private lateinit var repo: AccountMovementRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var locateRepo: LocateRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var trader: User
  private lateinit var other: User

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    locateRepo.deleteAll()
    tradeRepo.deleteAll()
    statRepo.deleteAll()
    userRepository.deleteAll()
    trader = userRepository.save(makeUser("trader"))
    other = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(trader)
  }

  /**
   * September 2026, Thursday 3 → Wednesday 23 : four weeks, the second without a movement. A trade
   * dated the day before the period counts in the opening balance only.
   */
  private fun seedSeptember() {
    trade("999.00", sept(2))
    trade("100.00", sept(3))
    trade("-40.00", sept(4))
    locate("-15.00", sept(5))
    cash(AccountMovementType.DEPOSIT, "1000.00", sept(14))
    cash(AccountMovementType.WITHDRAWAL, "-200.00", sept(15))
    cash(AccountMovementType.ADJUSTMENT, "-5.00", sept(16))
    trade("60.00", sept(17))
    trade("-30.00", sept(22))
  }

  private fun weeksOfSeptember(types: List<AccountMovementType>? = null): CashFlowDto =
    service.cashFlow(AccountMovementFilter(sept(3), sept(23), types), CashFlowBucketSize.WEEK)

  @Test
  fun `draws one bucket per week, Monday first, an empty week at zero`() {
    seedSeptember()

    val buckets = weeksOfSeptember().buckets

    assertEquals(listOf(sept(3), sept(7), sept(14), sept(21)), buckets.map { it.from })
    assertEquals(listOf(sept(6), sept(13), sept(20), sept(23)), buckets.map { it.to })
    assertAmount("0", buckets[1].net)
    assertAmount("0", buckets[1].winningTrades)
  }

  @Test
  fun `splits the trades by sign and keeps every other type apart`() {
    seedSeptember()

    val buckets = weeksOfSeptember().buckets
    val first = buckets.first()
    val third = buckets[2]
    val last = buckets.last()

    assertAmount("100.00", first.winningTrades)
    assertAmount("-40.00", first.losingTrades)
    assertAmount("-15.00", first.locates)
    assertAmount("45.00", first.net)
    assertAmount("60.00", third.winningTrades)
    assertAmount("1000.00", third.deposits)
    assertAmount("-200.00", third.withdrawals)
    assertAmount("-5.00", third.adjustments)
    assertAmount("855.00", third.net)
    assertAmount("-30.00", last.losingTrades)
  }

  @Test
  fun `leaves out what is dated before the period, but counts it in the opening balance`() {
    seedSeptember()

    val flow = weeksOfSeptember()

    assertAmount("100.00", flow.buckets.first().winningTrades)
    assertAmount("999.00", flow.openingBalance)
    assertAmount("1869.00", flow.closingBalance)
  }

  // « Trading seul » on the page : the chart and the totals narrow, the balance does not.
  @Test
  fun `empties the excluded series without touching the balances`() {
    seedSeptember()

    val flow = weeksOfSeptember(listOf(AccountMovementType.TRADE, AccountMovementType.LOCATE))
    val third = flow.buckets[2]

    assertAmount("0", third.deposits)
    assertAmount("0", third.withdrawals)
    assertAmount("0", third.adjustments)
    assertAmount("60.00", third.net)
    assertAmount("999.00", flow.openingBalance)
    assertAmount("1869.00", flow.closingBalance)
  }

  @Test
  fun `cuts months and quarters on the calendar, clipped to the period`() {
    trade("50.00", LocalDate.of(2026, 1, 20))
    trade("-20.00", LocalDate.of(2026, 7, 2))
    val filter = AccountMovementFilter(LocalDate.of(2026, 1, 15), LocalDate.of(2026, 7, 10))

    val months = service.cashFlow(filter, CashFlowBucketSize.MONTH).buckets
    val quarters = service.cashFlow(filter, CashFlowBucketSize.QUARTER).buckets

    assertEquals(7, months.size)
    assertEquals(LocalDate.of(2026, 1, 15), months.first().from)
    assertEquals(LocalDate.of(2026, 1, 31), months.first().to)
    assertEquals(LocalDate.of(2026, 7, 10), months.last().to)
    assertEquals(
      listOf(LocalDate.of(2026, 1, 15), LocalDate.of(2026, 4, 1), LocalDate.of(2026, 7, 1)),
      quarters.map { it.from },
    )
    assertAmount("50.00", quarters[0].winningTrades)
    assertAmount("0", quarters[1].net)
    assertAmount("-20.00", quarters[2].losingTrades)
  }

  @Test
  fun `cuts years on January, the first and last clipped to the period`() {
    trade("40.00", LocalDate.of(2024, 11, 5))
    trade("-15.00", LocalDate.of(2026, 3, 9))
    val filter = AccountMovementFilter(LocalDate.of(2024, 10, 1), LocalDate.of(2026, 6, 30))

    val years = service.cashFlow(filter, CashFlowBucketSize.YEAR).buckets

    assertEquals(
      listOf(LocalDate.of(2024, 10, 1), LocalDate.of(2025, 1, 1), LocalDate.of(2026, 1, 1)),
      years.map { it.from },
    )
    assertEquals(LocalDate.of(2026, 6, 30), years.last().to)
    assertAmount("40.00", years[0].winningTrades)
    assertAmount("0", years[1].net)
    assertAmount("-15.00", years[2].losingTrades)
  }

  @Test
  fun `draws a day without a movement at zero`() {
    trade("10.00", sept(14))
    trade("12.00", sept(16))

    val days =
      service.cashFlow(AccountMovementFilter(sept(14), sept(16)), CashFlowBucketSize.DAY).buckets

    assertEquals(listOf(sept(14), sept(15), sept(16)), days.map { it.from })
    assertAmount("0", days[1].net)
  }

  @Test
  fun `never counts another user's movements`() {
    seedSeptember()
    trade("5000.00", sept(15), owner = other)

    val third = weeksOfSeptember().buckets[2]

    assertAmount("60.00", third.winningTrades)
  }

  @Test
  fun `runs all time from the first movement to the last`() {
    trade("10.00", sept(4))
    trade("20.00", sept(22))

    val flow = service.cashFlow(AccountMovementFilter(), CashFlowBucketSize.WEEK)

    assertEquals(sept(4), flow.dateFrom)
    assertEquals(sept(22), flow.dateTo)
    assertEquals(4, flow.buckets.size)
    assertAmount("0", flow.openingBalance)
    assertAmount("30.00", flow.closingBalance)
  }

  @Test
  fun `answers no bucket for an account without any movement`() {
    val flow = service.cashFlow(AccountMovementFilter(), CashFlowBucketSize.MONTH)

    assertTrue(flow.buckets.isEmpty())
    assertAmount("0", flow.closingBalance)
  }

  @Test
  fun `refuses a period that ends before it starts`() {
    assertThrows(ResponseStatusException::class.java) {
      service.cashFlow(AccountMovementFilter(sept(23), sept(3)), CashFlowBucketSize.DAY)
    }
  }

  // Daily bars over two years : more than anyone reads, and the response grows with them.
  @Test
  fun `refuses a bucket too narrow for the period`() {
    val twoYears = AccountMovementFilter(LocalDate.of(2025, 1, 1), LocalDate.of(2026, 12, 31))

    assertThrows(ResponseStatusException::class.java) {
      service.cashFlow(twoYears, CashFlowBucketSize.DAY)
    }
  }

  // --------------------------------------------------------------------------- helpers

  private fun sept(day: Int): LocalDate = LocalDate.of(2026, 9, day)

  private fun assertAmount(expected: String, actual: BigDecimal) =
    assertEquals(0, BigDecimal(expected).compareTo(actual), "expected $expected, got $actual")

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )

  /** A TRADE movement needs its trade row : the DB ties the two together. */
  private fun trade(pnl: String, date: LocalDate, owner: User = trader) {
    val trade = tradeRepo.save(TradeEntry(user = owner, tradeDate = date, ticker = "KTTA"))
    repo.save(
      AccountMovement(
        user = owner,
        type = AccountMovementType.TRADE,
        amount = BigDecimal(pnl),
        valueDate = date,
        tradeEntryId = trade.id,
      )
    )
  }

  /** A LOCATE movement needs its locate row, and its ticker and shares. */
  private fun locate(cost: String, date: LocalDate) {
    val locate =
      locateRepo.save(
        Locate(
          user = trader,
          tradingDate = date,
          ticker = "KTTA",
          shares = 100,
          pricePerShare = BigDecimal("0.15"),
        )
      )
    repo.save(
      AccountMovement(
        user = trader,
        type = AccountMovementType.LOCATE,
        amount = BigDecimal(cost),
        valueDate = date,
        locateId = locate.id,
        locateTicker = "KTTA",
        locateShares = 100,
      )
    )
  }

  private fun cash(type: AccountMovementType, amount: String, date: LocalDate) {
    repo.save(
      AccountMovement(user = trader, type = type, amount = BigDecimal(amount), valueDate = date)
    )
  }
}
