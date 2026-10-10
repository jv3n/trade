package com.portfolioai.stats

import com.portfolioai.account.infrastructure.persistence.AccountMovementRepository
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
import java.time.LocalTime
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * Pins the stat → trade flow (#193) : the « → Trade » action of the stats sheet, the way a studied
 * trade comes into existence — a trade can also stand alone (#633).
 *
 * What is protected here :
 *
 * - the trade **inherits** the stat's date, ticker and pattern, and starts empty (no execution, no
 *   P&L) — the rest is typed on the trade page ;
 * - **several trades per stat** (#500) : each promotion creates the next one, short or long, each
 *   with its own account line — deleting one leaves the others ;
 * - the stats listing carries the links back (one per trade, in the day's order, with direction and
 *   retained P&L) so the UI can swap the button for them, and they survive an edit of the stat ;
 *   the « traded » KPI still counts stats, not trades ;
 * - deleting a stat **keeps its trades** (#635) : unlinked, with their executions, P&L, pattern and
 *   account line — the only way the stats invented for an import go away without the trades.
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
  @Autowired private lateinit var movementRepo: AccountMovementRepository

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
  fun `promoting a traded stat again creates the next trade — the first one is left alone`() {
    val first = statService.promoteToTrade(stat.id)

    val second = statService.promoteToTrade(stat.id)

    assertEquals(stat.id, second.statEntryId)
    assertEquals(2, tradeRepo.findAll().size)
    assertEquals(
      listOf(first.id, second.id),
      statService.findById(stat.id).trades.map { it.tradeId },
    )
  }

  @Test
  fun `a stat lists its trades in the day's order, a short and a long side by side`() {
    // KTTA, 17/09 : the GUS short in the morning, then a long on the bounce off the low — typed in
    // the reverse order, listed in the day's.
    val long = statService.promoteToTrade(stat.id)
    fill(long.id, TradeDirection.BUY, 200, "3.45", "3.77", LocalTime.of(14, 20))
    val short = statService.promoteToTrade(stat.id)
    fill(short.id, TradeDirection.SHORT, 350, "4.50", "3.66", LocalTime.of(9, 41))

    val row = statService.findById(stat.id)

    assertEquals(listOf(short.id, long.id), row.trades.map { it.tradeId })
    assertEquals(listOf(TradeDirection.SHORT, TradeDirection.BUY), row.trades.map { it.direction })
    assertEquals(
      listOf(BigDecimal("294.00"), BigDecimal("64.00")),
      row.trades.map { it.retainedProfitDollars },
    )
  }

  @Test
  fun `each trade of a stat has its own account line, and deleting one leaves the others`() {
    val short = statService.promoteToTrade(stat.id)
    fill(short.id, TradeDirection.SHORT, 350, "4.50", "3.66", LocalTime.of(9, 41))
    val long = statService.promoteToTrade(stat.id)
    fill(long.id, TradeDirection.BUY, 200, "3.45", "3.77", LocalTime.of(14, 20))

    tradeService.delete(long.id)

    assertEquals(listOf(short.id), statService.findById(stat.id).trades.map { it.tradeId })
    assertEquals(
      0,
      movementRepo.findByTradeEntryId(short.id)!!.amount.compareTo(BigDecimal("294.00")),
    )
    assertNull(movementRepo.findByTradeEntryId(long.id), "the deleted trade's line went with it")
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

    assertTrue(row.trades.isEmpty())
  }

  @Test
  fun `a traded stat carries the link to its trade and its retained P&L`() {
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

    assertEquals(trade.id, row.trades.single().tradeId)
    assertEquals(
      0,
      row.trades.single().retainedProfitDollars!!.compareTo(BigDecimal("97.60")),
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
  fun `a stat traded three times still counts once in the traded KPI`() {
    // « 8 / 10 traded stats » counts stats : three trades on one must not read « 3 / 2 ».
    statRepo.save(sampleStat(testUser, ticker = "BNZI"))
    repeat(3) { statService.promoteToTrade(stat.id) }

    val summary = statService.summarise(StatEntryFilter())

    assertEquals(1, summary.traded)
    assertEquals(1, summary.untraded)
  }

  @Test
  fun `completing a traded stat keeps the link — the button must not come back`() {
    val trade = statService.promoteToTrade(stat.id)

    val updated = statService.update(stat.id, completionRequest())

    assertEquals(listOf(trade.id), updated.trades.map { it.tradeId })
    assertNotNull(updated.openPrice, "the session block did land")
  }

  @Test
  fun `deleting a stat keeps its trades, unlinked — fills, P&L, pattern and account line kept`() {
    // The import of #628 : a stat invented to hold a real trade goes, the trade stays.
    val short = statService.promoteToTrade(stat.id)
    fill(short.id, TradeDirection.SHORT, 350, "4.50", "3.66", LocalTime.of(9, 41))
    val long = statService.promoteToTrade(stat.id)

    statService.delete(stat.id)

    assertNull(statRepo.findByIdAndUserId(stat.id, testUser.id), "the stat is gone")
    val kept = tradeService.findById(short.id)
    assertNull(kept.statEntryId)
    assertEquals(Pattern.GUS, kept.pattern, "the trade keeps the pattern it was filed under")
    assertEquals(2, kept.executions.size, "one entry and one exit, as typed")
    assertEquals(0, kept.retainedProfitDollars!!.compareTo(BigDecimal("294.00")))
    assertNull(tradeService.findById(long.id).statEntryId, "every trade of the stat, not only one")
    assertEquals(
      0,
      movementRepo.findByTradeEntryId(short.id)!!.amount.compareTo(BigDecimal("294.00")),
      "the account line stays : the balance does not move",
    )
  }

  @Test
  fun `deleting a stat leaves the trades of another stat linked`() {
    val other = statRepo.save(sampleStat(user = testUser, ticker = "BNZI"))
    val otherTrade = statService.promoteToTrade(other.id)
    statService.promoteToTrade(stat.id)

    statService.delete(stat.id)

    assertEquals(other.id, tradeService.findById(otherTrade.id).statEntryId)
  }

  @Test
  fun `a stat without a trade is deleted as before`() {
    statService.delete(stat.id)

    assertNull(statRepo.findByIdAndUserId(stat.id, testUser.id))
  }

  // ---------------------------------------------------------------------------
  // Sample factories
  // ---------------------------------------------------------------------------

  /** Types one entry and one exit of [shares] on trade [id], a minute apart from [at]. */
  private fun fill(
    id: UUID,
    direction: TradeDirection,
    shares: Int,
    entry: String,
    exit: String,
    at: LocalTime,
  ) =
    tradeService.update(
      id,
      TradeEntryRequest(
        statEntryId = stat.id,
        tradeDate = stat.tradeDate,
        ticker = stat.ticker,
        pattern = Pattern.GUS,
        direction = direction,
        executions =
          listOf(
            ExecutionRequest(ExecutionKind.ENTRY, shares, BigDecimal(entry), at),
            ExecutionRequest(ExecutionKind.EXIT, shares, BigDecimal(exit), at.plusMinutes(1)),
          ),
      ),
    )

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
