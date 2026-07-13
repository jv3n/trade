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
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Pins the journal → account integration : a trade's realized P&L lands in the account ledger as a
 * read-only `TRADE` movement, kept in sync through the trade's lifecycle.
 *
 * Drives the **real** [TradeEntryService] (create / update / delete) and asserts on the resulting
 * `account_movement` rows — exercising `TradeEntryService`'s `TradeChangedEvent` publication, the
 * `@TransactionalEventListener(AFTER_COMMIT)` bridge, `AccountTradeSyncService`'s upsert, and the
 * DB `ON DELETE CASCADE` on `trade_entry_id`, end to end against real Postgres.
 *
 * The AFTER_COMMIT listener runs synchronously as the service transaction commits, so by the time a
 * `service.create/update/delete` call returns the movement is already reconciled — no polling.
 *
 * `AuthService` is mocked so the user-scope is deterministic.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class AccountTradeSyncIntegrationTest {

  @Autowired private lateinit var tradeService: TradeEntryService
  @Autowired private lateinit var accountService: AccountService
  @Autowired private lateinit var accountRepo: AccountMovementRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User

  @BeforeEach
  fun setUp() {
    accountRepo.deleteAll()
    tradeRepo.deleteAll()
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
    tradeService.create(TradeEntryRequest(tradeDate = TRADE_DATE, ticker = "GUS"))
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
    tradeService.update(trade.id, TradeEntryRequest(tradeDate = TRADE_DATE, ticker = "AMC"))

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

    tradeService.create(closedTrade(ticker = "GUS", pnl = "100.00")) // fresh P&L, not a mistake

    assertEquals(
      0,
      BigDecimal("350.00").compareTo(accountService.summary().balance),
      "250 + 100 — a new trade is a real move, not absorbed by the correction",
    )
  }

  // ---------------------------------------------------------------------------

  private fun tradeMovements() =
    accountRepo.findByUserId(testUser.id).filter { it.type == AccountMovementType.TRADE }

  // Builds a SHORT 100-share position whose **derived** realized P&L equals `pnl` exactly :
  // profit = (entry - exit) * 100, with entry fixed at 10.00 and exit = 10 - pnl/100. The P&L is no
  // longer a user-supplied field (issue #93) — it falls out of the executions.
  private fun closedTrade(ticker: String, pnl: String): TradeEntryRequest {
    val shares = 100
    val entryPrice = BigDecimal("10.00")
    val exitPrice = entryPrice.subtract(BigDecimal(pnl).divide(BigDecimal(shares)))
    return TradeEntryRequest(
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
