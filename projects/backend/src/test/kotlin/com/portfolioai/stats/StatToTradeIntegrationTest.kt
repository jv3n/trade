package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.application.TradeEntryService
import com.portfolioai.journal.application.dto.ExecutionRequest
import com.portfolioai.journal.application.dto.TradeEntryRequest
import com.portfolioai.journal.domain.ExecutionKind
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.shared.TradeDirection
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
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
 * Pins the stat → trade flow (#193) : the « → Trade » action of the stats sheet, which is the only
 * way a trade comes into existence.
 *
 * What is protected here :
 *
 * - the trade **inherits** the stat's date, ticker and pattern, and starts empty (no execution, no
 *   P&L) — the rest is typed on the trade page ;
 * - **one trade per stat** : a second promotion is a 409, never a second row ;
 * - the stats listing carries the link back (trade id + retained P&L) so the UI can swap the button
 *   for a link, and it survives an edit of the stat ;
 * - a stat that gave birth to a trade **can't be deleted** — 409 rather than the 500 the ON DELETE
 *   RESTRICT would otherwise produce ;
 * - a stat **re-filed under another pattern** takes its trade along (#393).
 *
 * `AuthService` is mocked so the user scope is deterministic ; a second user is seeded to check the
 * action can't reach across tenants.
 */
@SpringBootTest
class StatToTradeIntegrationTest {

  @Autowired private lateinit var statService: StatEntryService
  @Autowired private lateinit var tradeService: TradeEntryService
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User
  private lateinit var stat: StatEntry

  @BeforeEach
  fun setUp() {
    // Trades first : the stat FK is ON DELETE RESTRICT (#192).
    tradeRepo.deleteAll()
    statRepo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)
    stat = statRepo.save(sampleStat(user = testUser))
  }

  @Test
  fun `promoting a stat creates a trade that inherits its date, ticker and pattern`() {
    val trade = statService.promoteToTrade(stat.id)

    assertEquals(stat.id, trade.statEntryId)
    assertEquals(stat.tradeDate, trade.tradeDate)
    assertEquals("KTTA", trade.ticker)
    assertEquals(Pattern.GUS, trade.pattern)
  }

  @Test
  fun `the fresh trade carries nothing but the stat identity — everything else comes later`() {
    val trade = statService.promoteToTrade(stat.id)

    assertNull(trade.direction, "no execution has been typed in yet")
    assertEquals(0, trade.executions.size)
    assertNull(trade.profitDollars)
    assertNull(trade.realProfitDollars)
    assertNull(trade.retainedProfitDollars)
    assertNull(trade.note)
    assertNull(trade.errorNote)
  }

  @Test
  fun `promoting the same stat twice is a 409 — one trade per stat`() {
    statService.promoteToTrade(stat.id)

    val ex =
      assertThrows(ResponseStatusException::class.java) { statService.promoteToTrade(stat.id) }

    assertEquals(409, ex.statusCode.value())
    assertEquals(1, tradeRepo.findAll().size, "the second call must not have created a row")
  }

  @Test
  fun `promoting a foreign stat returns 404 — no existence leak, no cross-tenant trade`() {
    val foreign = statRepo.save(sampleStat(user = otherUser, ticker = "BNZI"))

    val ex =
      assertThrows(ResponseStatusException::class.java) { statService.promoteToTrade(foreign.id) }

    assertEquals(404, ex.statusCode.value())
  }

  @Test
  fun `a stat without a trade carries no link — the listing offers the action`() {
    val row = statService.findAllPaged(StatEntryFilter(), PageRequest.of(0, 50)).content.single()

    assertNull(row.tradeId)
    assertNull(row.tradeRetainedProfitDollars)
  }

  @Test
  fun `a traded stat carries the trade id and its retained P&L`() {
    val trade = statService.promoteToTrade(stat.id)
    // The trade is filled in afterwards, on its own page : SHORT 100 @ 5 covered @ 4 → 100 $, with
    // the broker statement reading 97.60 once the fees are in.
    tradeService.update(
      trade.id,
      TradeEntryRequest(
        statEntryId = stat.id,
        tradeDate = stat.tradeDate,
        ticker = stat.ticker,
        pattern = Pattern.GUS,
        direction = TradeDirection.SHORT,
        executions =
          listOf(
            ExecutionRequest(ExecutionKind.ENTRY, 100, BigDecimal("5")),
            ExecutionRequest(ExecutionKind.EXIT, 100, BigDecimal("4")),
          ),
        realProfitDollars = BigDecimal("97.60"),
      ),
    )

    val row = statService.findById(stat.id)

    assertEquals(trade.id, row.tradeId)
    assertEquals(
      0,
      row.tradeRetainedProfitDollars!!.compareTo(BigDecimal("97.60")),
      "the link shows the retained P&L — the real one here, not the 100 computed",
    )
  }

  @Test
  fun `the summary counts how many stats of the period were traded`() {
    // The journal's « 8 / 10 traded stats » KPI (#195) reads this pair, and links to the rest.
    statRepo.save(sampleStat(testUser, ticker = "BNZI"))
    statService.promoteToTrade(stat.id)

    val summary = statService.summarise(StatEntryFilter())

    assertEquals(2, summary.traded + summary.untraded, "both stats are in the filtered set")
    assertEquals(1, summary.traded)
    assertEquals(1, summary.untraded)
  }

  @Test
  fun `completing a traded stat keeps the link — the button must not come back`() {
    val trade = statService.promoteToTrade(stat.id)

    val updated = statService.update(stat.id, completionRequest())

    assertEquals(trade.id, updated.tradeId)
    assertNotNull(updated.openPrice, "the session block did land")
  }

  @Test
  fun `re-filing a traded stat under another pattern moves its trade along`() {
    val trade = statService.promoteToTrade(stat.id)

    statService.update(stat.id, completionRequest().copy(pattern = Pattern.DT))

    assertEquals(Pattern.DT, tradeRepo.findById(trade.id).orElseThrow().pattern)
  }

  @Test
  fun `a stat without a trade is re-filed on its own, onto the new patterns too`() {
    // SIR and SIV only exist once V9 added them to the Postgres enum : this save goes through it.
    val updated = statService.update(stat.id, completionRequest().copy(pattern = Pattern.SIR))

    assertEquals(Pattern.SIR, updated.pattern)
    assertEquals(Pattern.SIR, statRepo.findByIdAndUserId(stat.id, testUser.id)!!.pattern)
  }

  @Test
  fun `deleting a stat that has a trade is a 409 — the trade goes first`() {
    statService.promoteToTrade(stat.id)

    val ex = assertThrows(ResponseStatusException::class.java) { statService.delete(stat.id) }

    assertEquals(409, ex.statusCode.value())
    assertNotNull(statRepo.findByIdAndUserId(stat.id, testUser.id), "the stat is still there")
  }

  @Test
  fun `deleting the trade frees the stat — it can be deleted, and promoted again`() {
    val trade = statService.promoteToTrade(stat.id)
    tradeService.delete(trade.id)

    val again = statService.promoteToTrade(stat.id)

    assertEquals(stat.id, again.statEntryId, "the slot is free again once the trade is gone")
  }

  // ---------------------------------------------------------------------------
  // Sample factories
  // ---------------------------------------------------------------------------

  private fun saveUser(prefix: String) =
    userRepository.save(
      User(
        email = "$prefix-${UUID.randomUUID()}@test.local",
        displayName = prefix.replaceFirstChar { it.uppercase() },
        provider = "test",
        providerId = null,
        role = Role.USER,
      )
    )

  /** A stat "to complete" : the premarket block only, the way a promoted candidate lands. */
  private fun sampleStat(user: User, ticker: String = "KTTA") =
    StatEntry(
      user = user,
      tradeDate = TRADE_DATE,
      ticker = ticker,
      previousClose = BigDecimal("2.6500"),
      pmOpen = BigDecimal("4.0500"),
      pmHigh = BigDecimal("4.6500"),
    )

  /** The completion panel payload — the premarket recap plus the session prices. */
  private fun completionRequest() =
    StatEntryRequest(
      tradeDate = TRADE_DATE,
      ticker = "KTTA",
      pattern = Pattern.GUS,
      previousClose = BigDecimal("2.6500"),
      pmOpen = BigDecimal("4.0500"),
      pmHigh = BigDecimal("4.6500"),
      openPrice = BigDecimal("4.2000"),
      pushOpenPrice = BigDecimal("4.6200"),
      hodPrice = BigDecimal("4.6200"),
      lodPrice = BigDecimal("3.4100"),
      eodPrice = BigDecimal("3.5200"),
    )

  private companion object {
    val TRADE_DATE: LocalDate = LocalDate.of(2026, 9, 17)
  }
}
