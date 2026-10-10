package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.candidates.domain.Candidate
import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
 * Pins « Same ticker, another pattern » (#507) : a stat born from a stat — the GUS of the morning
 * and the DT of late morning are two stats of one ticker-day. A stat is a GUS or a DT (#648), so
 * the other pattern is always the other of the two.
 *
 * What is protected here :
 *
 * - a DT born from the GUS starts from the day's open and keeps float, volume and the day's flags —
 *   but none of the premarket (#649) nor of the GUS session ;
 * - a GUS born from a DT takes its candidate's premarket ; without a candidate, none is offered ;
 * - the sibling keeps the day, the ticker and the source candidate ;
 * - **one stat per pattern** still holds : a pattern the day already has is a 409, a pattern a stat
 *   does not measure is a 400, and only the free one is offered ;
 * - the sibling is an ordinary stat : its own trades, its own line in its pattern's listing.
 */
@SpringBootTest
class StatSiblingIntegrationTest {

  @Autowired private lateinit var statService: StatEntryService
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository
  @Autowired private lateinit var candidateRepo: CandidateRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  /** KTTA, 17/09 : the morning's GUS, complete, with a push and a note of its own. */
  private lateinit var gus: StatEntry

  @BeforeEach
  fun setUp() {
    tradeRepo.deleteAll()
    statRepo.deleteAll()
    candidateRepo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)
    gus = statRepo.save(morningGus(testUser))
  }

  @Test
  fun `a double top born from the GUS keeps the day's float, volume and flags, not the setup's`() {
    val dt = statService.createSibling(gus.id, Pattern.DT)

    assertEquals(Pattern.DT, dt.pattern)
    assertEquals(gus.tradeDate, dt.tradeDate)
    assertEquals("KTTA", dt.ticker)
    assertEquals(gus.candidateId, dt.candidateId, "the same candidate gave birth to both")
    assertTrue(dt.ssr, "SSR is the day's, whatever the setup")
    assertNull(dt.note)
    assertFalse(dt.completed, "ticked by hand, like any stat")
  }

  @Test
  fun `a double top born from a no-push day carries no « no push » — its view never shows one`() {
    // The « Sans push » tab is hidden outside the session views : a DT holding the flag would
    // carry a fact nothing on its own page can show or clear.
    gus.pushOpenPrice = null
    gus.noPush = true
    statRepo.save(gus)

    val dt = statService.createSibling(gus.id, Pattern.DT)

    assertFalse(dt.noPush)
    assertNull(dt.pushOpenPrice)
    assertEquals(0, dt.dtStartPrice!!.compareTo(BigDecimal("4.2000")), "still from the open")
  }

  @Test
  fun `a double top born from the GUS starts from the day's open`() {
    val dt = statService.createSibling(gus.id, Pattern.DT)

    assertEquals(0, dt.dtStartPrice!!.compareTo(BigDecimal("4.2000")))
    assertNull(dt.dtTopPrice)
    assertNull(dt.openPrice, "a double top has its own prices, not the GUS session")
    assertNull(dt.pushOpenPrice)
    assertFalse(dt.noPush)
  }

  @Test
  fun `a double top born from the GUS keeps none of the premarket, only float and volume`() {
    val dt = statService.createSibling(gus.id, Pattern.DT)

    assertNull(dt.previousClose)
    assertNull(dt.pmOpen)
    assertNull(dt.pmHigh)
    assertEquals(0, dt.floatMillions!!.compareTo(BigDecimal("8.20")))
    assertEquals(0, dt.volumeMillions!!.compareTo(BigDecimal("3.10")))
  }

  @Test
  fun `a GUS born from a double top takes its candidate's premarket`() {
    // SGBX 18/09 : promoted to DT only — the stat has no premarket to hand on.
    val candidate = candidateRepo.save(sgbxCandidate(testUser))
    val dt = statRepo.save(sgbxDoubleTop(testUser, candidate.id))

    assertEquals(listOf(Pattern.GUS), statService.freePatterns(dt.id))
    val gusOfTheDay = statService.createSibling(dt.id, Pattern.GUS)

    assertEquals(0, gusOfTheDay.previousClose!!.compareTo(BigDecimal("1.1200")))
    assertEquals(0, gusOfTheDay.pmOpen!!.compareTo(BigDecimal("1.8500")))
    assertEquals(0, gusOfTheDay.pmHigh!!.compareTo(BigDecimal("2.4600")))
    assertEquals(0, gusOfTheDay.floatMillions!!.compareTo(BigDecimal("3.90")))
    assertEquals(candidate.id, gusOfTheDay.candidateId)
  }

  @Test
  fun `a double top typed by hand offers no sibling, and asking for one is a 400`() {
    val dt = statRepo.save(sgbxDoubleTop(testUser, candidateId = null))

    assertEquals(emptyList<Pattern>(), statService.freePatterns(dt.id))
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        statService.createSibling(dt.id, Pattern.GUS)
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `the free pattern is the other of GUS and DT, until the day has it`() {
    assertEquals(listOf(Pattern.DT), statService.freePatterns(gus.id))

    statService.createSibling(gus.id, Pattern.DT)

    assertEquals(emptyList<Pattern>(), statService.freePatterns(gus.id))
  }

  @Test
  fun `a pattern a stat does not measure is a 400 — SIR, SIV and discretionary are trades only`() {
    for (pattern in listOf(Pattern.SIR, Pattern.SIV, Pattern.DISCRETIONARY)) {
      val ex =
        assertThrows(ResponseStatusException::class.java) {
          statService.createSibling(gus.id, pattern)
        }
      assertEquals(400, ex.statusCode.value(), "$pattern")
    }
  }

  @Test
  fun `a pattern the day already has is a 409 — one stat per pattern`() {
    statService.createSibling(gus.id, Pattern.DT)

    val twice =
      assertThrows(ResponseStatusException::class.java) {
        statService.createSibling(gus.id, Pattern.DT)
      }
    val own =
      assertThrows(ResponseStatusException::class.java) {
        statService.createSibling(gus.id, Pattern.GUS)
      }

    assertEquals(409, twice.statusCode.value())
    assertEquals(409, own.statusCode.value())
  }

  @Test
  fun `the sibling has its own trades and its own line in its pattern's listing`() {
    val sibling = statService.createSibling(gus.id, Pattern.DT)
    val trade = statService.promoteToTrade(sibling.id)

    assertEquals(Pattern.DT, trade.pattern)
    assertEquals(listOf(trade.id), statService.findById(sibling.id).trades.map { it.tradeId })
    assertTrue(statService.findById(gus.id).trades.isEmpty(), "the GUS is left alone")
    val gusRows =
      statService
        .findAllPaged(StatEntryFilter(pattern = Pattern.GUS), PageRequest.of(0, 50))
        .content
    assertEquals(listOf(gus.id), gusRows.map { it.id }, "only the GUS in the GUS statistics")
  }

  @Test
  fun `a foreign stat gives no sibling — 404, no existence leak`() {
    val foreign = statRepo.save(morningGus(otherUser))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        statService.createSibling(foreign.id, Pattern.DT)
      }

    assertEquals(404, ex.statusCode.value())
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

  private fun morningGus(user: User) =
    StatEntry(
        user = user,
        tradeDate = LocalDate.of(2026, 9, 17),
        ticker = "KTTA",
        previousClose = BigDecimal("2.6500"),
        pmOpen = BigDecimal("4.0500"),
        pmHigh = BigDecimal("4.6500"),
      )
      .apply {
        floatMillions = BigDecimal("8.20")
        volumeMillions = BigDecimal("3.10")
        note = "Rejected under the PM high."
        openPrice = BigDecimal("4.2000")
        pushOpenPrice = BigDecimal("4.6200")
        hodPrice = BigDecimal("4.6200")
        lodPrice = BigDecimal("3.4100")
        eodPrice = BigDecimal("3.5200")
        ssr = true
      }

  private fun sgbxCandidate(user: User) =
    Candidate(
      user = user,
      tradingDate = LocalDate.of(2026, 9, 18),
      ticker = "SGBX",
      previousClose = BigDecimal("1.1200"),
      pmOpen = BigDecimal("1.8500"),
      pmHigh = BigDecimal("2.4600"),
    )

  private fun sgbxDoubleTop(user: User, candidateId: UUID?) =
    StatEntry(
        user = user,
        candidateId = candidateId,
        tradeDate = LocalDate.of(2026, 9, 18),
        pattern = Pattern.DT,
        ticker = "SGBX",
      )
      .apply {
        floatMillions = BigDecimal("3.90")
        dtStartPrice = BigDecimal("1.9000")
      }
}
