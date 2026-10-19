package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.RuleScoreRowDto
import com.portfolioai.stats.domain.MechanicalRule
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.Instant
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
import org.springframework.http.HttpStatus
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * Integration spec for [StatEntryService.scoreRules] (#205) on a real Postgres : the mechanical GUS
 * rules replayed over a rolling window.
 *
 * What it pins :
 * - **The figures** — per rule, the trades triggered, stopped and won, the average win and loss,
 *   their ratio and the expectancy ; a rule read on its own levels.
 * - **The window** — the last N months up to today, its first day included ; the page's period
 *   filter has no say, and only 1, 2, 3, 6 or 12 months are offered.
 * - **The rows** — the caller's completed GUS : a stat still to complete and another user's stay
 *   out.
 *
 * The rule's arithmetic itself is `MechanicalRuleTest`'s. Every stat opens at $2.00 : 10 / 40
 * enters at 2.20 and stops at 2.80, 7 / 31 at 2.14 and 2.62.
 */
@SpringBootTest
class RuleScoreIntegrationTest {

  @Autowired private lateinit var service: StatEntryService
  @Autowired private lateinit var repo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User
  private val today: LocalDate = LocalDate.now()

  @BeforeEach
  fun setUp() {
    // Trades first : `trade_entry.stat_entry_id` is ON DELETE RESTRICT.
    tradeRepo.deleteAll()
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = userRepository.save(makeUser("trader"))
    otherUser = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  @Test
  fun `scores each rule on the completed GUS of the window`() {
    repo.save(completedGus("KTTA", hod = "2.40", eod = "1.76")) // both rules win
    repo.save(completedGus("GLND", hod = "2.90", eod = "1.50")) // both rules stopped
    repo.save(completedGus("BKYI", hod = "2.10", eod = "1.80")) // neither triggers

    val score = service.scoreRules(2)

    assertEquals(3, score.completed)
    assertEquals(
      RuleScoreRowDto(
        rule = MechanicalRule.TEN_FORTY,
        entryPercent = 10,
        stopPercent = 40,
        triggered = 2,
        stopped = 1,
        wins = 1,
        averageWinPercent = BigDecimal("20.00"),
        averageLossPercent = BigDecimal("-27.27"),
        winLossRatio = BigDecimal("0.73"),
        expectancyPercent = BigDecimal("-3.64"),
      ),
      score.rules.single { it.rule == MechanicalRule.TEN_FORTY },
    )
  }

  @Test
  fun `the second rule reads its own entry, so a day can trigger it alone`() {
    // HOD 2.16 : past 7 / 31's entry (2.14), short of 10 / 40's (2.20).
    repo.save(completedGus("KTTA", hod = "2.16", eod = "1.80"))

    val rules = service.scoreRules(2).rules.associateBy { it.rule }

    assertEquals(0, rules.getValue(MechanicalRule.TEN_FORTY).triggered)
    assertEquals(1, rules.getValue(MechanicalRule.SEVEN_THIRTY_ONE).triggered)
  }

  @Test
  fun `the window runs from the same day N months back to today, its first day included`() {
    repo.save(completedGus("KTTA", hod = "2.40", eod = "1.76", tradeDate = today.minusMonths(2)))
    repo.save(
      completedGus(
        "GLND",
        hod = "2.40",
        eod = "1.76",
        tradeDate = today.minusMonths(2).minusDays(1),
      )
    )

    val score = service.scoreRules(2)

    assertEquals(today.minusMonths(2), score.dateFrom)
    assertEquals(today, score.dateTo)
    assertEquals(1, score.completed)
  }

  @Test
  fun `a longer window takes the older stats in`() {
    repo.save(completedGus("KTTA", hod = "2.40", eod = "1.76", tradeDate = today.minusMonths(4)))

    assertEquals(0, service.scoreRules(2).completed)
    assertEquals(1, service.scoreRules(6).completed)
  }

  @Test
  fun `a stat still to complete and another user's GUS stay out`() {
    repo.save(completedGus("KTTA", hod = "2.40", eod = "1.76").apply { completedAt = null })
    repo.save(completedGus("GLND", hod = "2.40", eod = "1.76", owner = otherUser))

    assertEquals(0, service.scoreRules(2).completed)
  }

  @Test
  fun `a window with no completed GUS gives every rule with no trade and no figure`() {
    val rules = service.scoreRules(1).rules

    assertEquals(MechanicalRule.entries, rules.map { it.rule })
    rules.forEach { row ->
      assertEquals(0, row.triggered)
      assertNull(row.averageWinPercent)
      assertNull(row.expectancyPercent)
    }
  }

  @Test
  fun `a window other than 1, 2, 3, 6 or 12 months is a 400`() {
    val error = assertThrows(ResponseStatusException::class.java) { service.scoreRules(4) }

    assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
  }

  private fun completedGus(
    ticker: String,
    hod: String,
    eod: String,
    tradeDate: LocalDate = today.minusDays(3),
    owner: User = testUser,
  ) =
    StatEntry(
      user = owner,
      tradeDate = tradeDate,
      ticker = ticker,
      previousClose = BigDecimal("1.20"),
      pmOpen = BigDecimal("1.90"),
      pmHigh = BigDecimal("2.30"),
      openPrice = BigDecimal("2.00"),
      pushOpenPrice = BigDecimal(hod),
      hodPrice = BigDecimal(hod),
      lodPrice = BigDecimal("1.40"),
      eodPrice = BigDecimal(eod),
      completedAt = Instant.now(),
    )

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )
}
