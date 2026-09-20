package com.portfolioai.account

import com.portfolioai.account.application.AccountService
import com.portfolioai.account.application.dto.CorrectionRequest
import com.portfolioai.account.domain.AccountMovementType
import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.ExecutionRequest
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.domain.TradeDirection
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Pins the journal → account integration : a trade's realized P&L lands in the account ledger as a
 * read-only `TRADE` movement, kept in sync through the trade's lifecycle.
 *
 * Drives the **real** [TradeEntryService] (create / update / delete) and asserts on the resulting
 * `account_movement` rows — exercising `TradeEntryService`'s `TradeChangedEvent` publication, the
 * synchronous `@EventListener` bridge, `AccountTradeSyncService`'s upsert, and the DB `ON DELETE
 * CASCADE` on `trade_entry_id`, end to end against real Postgres.
 *
 * The listener runs synchronously inside the service transaction, so by the time a
 * `service.create/update/delete` call returns the movement is already reconciled — no polling.
 *
 * `AuthService` is mocked so the user-scope is deterministic.
 */
@SpringBootTest
class AccountTradeSyncIntegrationTest {

  @Autowired private lateinit var tradeService: TradeEntryService
  @Autowired private lateinit var accountService: AccountService
  @Autowired private lateinit var accountRepo: AccountMovementRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User

  /**
   * The stats the trades of this test hang off — the journal FK is mandatory since #192, and a stat
   * carries at most one trade since #193, so a test with two trades needs two stats.
   */
  private lateinit var stat: StatEntry
  private lateinit var secondStat: StatEntry

  @BeforeEach
  fun setUp() {
    accountRepo.deleteAll()
    tradeRepo.deleteAll()
    statRepo.deleteAll()
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

    stat = saveStat("BAC")
    secondStat = saveStat("GUS")
  }

  @Test
  fun `a closed trade with realized P&L creates a linked read-only TRADE movement`() {
    val trade = tradeService.create(closedTrade(ticker = "BAC", pnl = "300.00"))

    val movements = tradeMovements()
    assertEquals(1, movements.size, "one TRADE movement per closed trade")
    val m = movements.single()
    assertEquals(AccountMovementType.TRADE, m.type)
    assertEquals(0, BigDecimal("300.00").compareTo(m.amount), "amount = realized P&L")
    assertEquals(trade.id, m.tradeEntryId, "linked back to the trade")
    assertEquals("BAC", m.note, "ticker carried as the note")
  }

  @Test
  fun `an open trade (no realized P&L) creates no movement`() {
    tradeService.create(
      TradeEntryRequest(statEntryId = stat.id, tradeDate = TRADE_DATE, ticker = "GUS")
    )
    assertEquals(0, tradeMovements().size, "an open trade has no balance impact")
  }

  @Test
  fun `a break-even trade (zero P&L) creates no movement`() {
    tradeService.create(closedTrade(ticker = "SOBR", pnl = "0.00"))
    assertEquals(0, tradeMovements().size, "zero P&L doesn't move the balance")
  }

  @Test
  fun `editing the P&L updates the existing movement in place — no duplicate`() {
    val trade = tradeService.create(closedTrade(ticker = "NUKK", pnl = "300.00"))

    tradeService.update(trade.id, closedTrade(ticker = "NUKK", pnl = "450.00"))

    val movements = tradeMovements()
    assertEquals(1, movements.size, "upsert keyed on tradeEntryId — not a second row")
    assertEquals(0, BigDecimal("450.00").compareTo(movements.single().amount))
  }

  @Test
  fun `clearing the P&L removes the movement (reopened trade)`() {
    val trade = tradeService.create(closedTrade(ticker = "AMC", pnl = "300.00"))
    assertEquals(1, tradeMovements().size)

    // Reopen : same trade, no realized P&L anymore.
    tradeService.update(
      trade.id,
      TradeEntryRequest(statEntryId = stat.id, tradeDate = TRADE_DATE, ticker = "AMC"),
    )

    assertEquals(0, tradeMovements().size, "a reopened trade drops its TRADE movement")
  }

  @Test
  fun `deleting a trade removes its movement via the DB cascade`() {
    val trade = tradeService.create(closedTrade(ticker = "MULN", pnl = "300.00"))
    assertNotNull(accountRepo.findByTradeEntryId(trade.id))

    tradeService.delete(trade.id)

    assertNull(
      accountRepo.findByTradeEntryId(trade.id),
      "ON DELETE CASCADE on trade_entry_id removes the movement",
    )
  }

  @Test
  fun `the movement carries the real P&L when the broker statement has been entered`() {
    // The account must match the broker to the cent : once the real P&L is typed in, the computed
    // one stops reaching the ledger (#192).
    val request =
      closedTrade(ticker = "BAC", pnl = "300.00").copy(realProfitDollars = BigDecimal("287.35"))

    tradeService.create(request)

    assertEquals(
      0,
      BigDecimal("287.35").compareTo(tradeMovements().single().amount),
      "the retained P&L is the real one, not the 300.00 computed from the executions",
    )
  }

  @Test
  fun `the synced trade P&L counts in the account balance and tradesPnl`() {
    tradeService.create(closedTrade(ticker = "FFIE", pnl = "820.00"))

    val summary = accountService.summary()
    assertEquals(0, BigDecimal("820.00").compareTo(summary.tradesPnl))
    assertEquals(
      0,
      BigDecimal("820.00").compareTo(summary.balance),
      "balance reflects the trade P&L",
    )
  }

  // ---------------------------------------------------------------------------
  // Floating correction × trade lifecycle
  // ---------------------------------------------------------------------------

  @Test
  fun `editing a trade P&L re-floats the latest correction onto its target`() {
    val trade = tradeService.create(closedTrade(ticker = "BAC", pnl = "300.00")) // balance 300
    accountService.correctBalance(
      CorrectionRequest(BigDecimal("250.00"), TRADE_DATE)
    ) // adj −50 → 250

    tradeService.update(trade.id, closedTrade(ticker = "BAC", pnl = "500.00"))

    assertEquals(
      0,
      BigDecimal("250.00").compareTo(accountService.summary().balance),
      "the correction absorbs the P&L change so the balance stays on target",
    )
  }

  @Test
  fun `deleting a trade re-floats the latest correction onto its target`() {
    val trade = tradeService.create(closedTrade(ticker = "BAC", pnl = "300.00")) // balance 300
    accountService.correctBalance(
      CorrectionRequest(BigDecimal("250.00"), TRADE_DATE)
    ) // adj −50 → 250

    tradeService.delete(trade.id)

    // Before the removal event, the frozen −50 left the balance at −50 ; now it re-floats to 250.
    assertEquals(0, BigDecimal("250.00").compareTo(accountService.summary().balance))
  }

  @Test
  fun `a brand-new trade after a correction still moves the balance`() {
    tradeService.create(closedTrade(ticker = "BAC", pnl = "300.00")) // balance 300
    accountService.correctBalance(
      CorrectionRequest(BigDecimal("250.00"), TRADE_DATE)
    ) // adj −50 → 250

    tradeService.create(
      closedTrade(ticker = "GUS", pnl = "100.00", statEntryId = secondStat.id)
    ) // fresh P&L, not a mistake

    assertEquals(
      0,
      BigDecimal("350.00").compareTo(accountService.summary().balance),
      "250 + 100 — a new trade is a real move, not absorbed by the correction",
    )
  }

  // ---------------------------------------------------------------------------

  private fun saveStat(ticker: String) =
    statRepo.save(
      StatEntry(
        user = testUser,
        tradeDate = TRADE_DATE,
        ticker = ticker,
        previousClose = BigDecimal("2.6500"),
        pmOpen = BigDecimal("3.2100"),
        pmHigh = BigDecimal("3.6000"),
      )
    )

  private fun tradeMovements() =
    accountRepo.findByUserId(testUser.id).filter { it.type == AccountMovementType.TRADE }

  // Builds a SHORT 100-share position whose **derived** realized P&L equals `pnl` exactly :
  // profit = (entry - exit) * 100, with entry fixed at 10.00 and exit = 10 - pnl/100. The P&L is no
  // longer a user-supplied field (issue #93) — it falls out of the executions.
  private fun closedTrade(
    ticker: String,
    pnl: String,
    statEntryId: UUID = stat.id,
  ): TradeEntryRequest {
    val shares = 100
    val entryPrice = BigDecimal("10.00")
    val exitPrice = entryPrice.subtract(BigDecimal(pnl).divide(BigDecimal(shares)))
    return TradeEntryRequest(
      statEntryId = statEntryId,
      tradeDate = TRADE_DATE,
      ticker = ticker,
      direction = TradeDirection.SHORT,
      executions =
        listOf(
          ExecutionRequest(ExecutionKind.ENTRY, shares, entryPrice),
          ExecutionRequest(ExecutionKind.EXIT, shares, exitPrice),
        ),
    )
  }

  private companion object {
    val TRADE_DATE: LocalDate = LocalDate.of(2026, 6, 15)
  }
}
