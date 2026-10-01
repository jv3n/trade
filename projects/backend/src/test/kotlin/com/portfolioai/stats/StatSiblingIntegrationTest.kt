package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
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
 * Pins « Same ticker, another pattern » (#507) : a stat born from a stat, so a trade under another
 * pattern than the morning's — a DT in the afternoon, a discretionary long on the bounce — gets a
 * stat of its own instead of being filed under the GUS or not at all.
 *
 * What is protected here :
 *
 * - **the day's prices are carried over** (premarket, open, HOD / LOD / EOD, float, volume, locate,
 *   the day's flags) and what belongs to the setup starts empty (push, « no push », « after 11 am
 *   », the note, the double-top prices — a double top starts from the open) ;
 * - the sibling keeps the day, the ticker and the source candidate ;
 * - **one stat per pattern** still holds : a pattern the day already has is a 409, and only the
 *   free ones are offered ;
 * - the sibling is an ordinary stat : its own trades, its own line in its pattern's listing.
 */
@SpringBootTest
class StatSiblingIntegrationTest {

  @Autowired private lateinit var statService: StatEntryService
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  /** KTTA, 17/09 : the morning's GUS, complete, with a push and a note of its own. */
  private lateinit var gus: StatEntry

  @BeforeEach
  fun setUp() {
    tradeRepo.deleteAll()
    statRepo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)
    gus = statRepo.save(morningGus(testUser))
  }

  @Test
  fun `a discretionary stat born from the GUS carries the day's prices, not the setup's`() {
    val sibling = statService.createSibling(gus.id, Pattern.DISCRETIONARY)

    assertEquals(Pattern.DISCRETIONARY, sibling.pattern)
    assertEquals(gus.tradeDate, sibling.tradeDate)
    assertEquals("KTTA", sibling.ticker)
    assertEquals(gus.candidateId, sibling.candidateId, "the same candidate gave birth to both")
    assertEquals(0, sibling.pmHigh.compareTo(BigDecimal("4.6500")))
    assertEquals(0, sibling.floatMillions!!.compareTo(BigDecimal("8.20")))
    assertEquals(0, sibling.openPrice!!.compareTo(BigDecimal("4.2000")))
    assertEquals(0, sibling.lodPrice!!.compareTo(BigDecimal("3.4100")))
    assertEquals(0, sibling.eodPrice!!.compareTo(BigDecimal("3.5200")))
    assertTrue(sibling.ssr, "SSR is the day's, whatever the setup")
    assertNull(sibling.pushOpenPrice, "the push at the open is the GUS's reading")
    assertFalse(sibling.entryAfter11am)
    assertNull(sibling.note)
    assertFalse(sibling.completed, "ticked by hand, like any stat")
  }

  @Test
  fun `a double top born from the GUS starts from the day's open`() {
    val dt = statService.createSibling(gus.id, Pattern.DT)

    assertEquals(0, dt.dtStartPrice!!.compareTo(BigDecimal("4.2000")))
    assertNull(dt.dtTopPrice)
    assertNull(dt.openPrice, "a double top has its own prices, not the GUS session")
    assertEquals(0, dt.previousClose.compareTo(BigDecimal("2.6500")))
  }

  @Test
  fun `the free patterns are the ones the day and ticker have no stat for yet`() {
    statService.createSibling(gus.id, Pattern.DT)

    assertEquals(
      listOf(Pattern.SIR, Pattern.SIV, Pattern.DISCRETIONARY),
      statService.freePatterns(gus.id),
    )
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
    val sibling = statService.createSibling(gus.id, Pattern.DISCRETIONARY)
    val trade = statService.promoteToTrade(sibling.id)

    assertEquals(Pattern.DISCRETIONARY, trade.pattern)
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
        locatePerShare = BigDecimal("0.0300")
        note = "Rejected under the PM high."
        openPrice = BigDecimal("4.2000")
        pushOpenPrice = BigDecimal("4.6200")
        hodPrice = BigDecimal("4.6200")
        lodPrice = BigDecimal("3.4100")
        eodPrice = BigDecimal("3.5200")
        ssr = true
        entryAfter11am = true
      }
}
