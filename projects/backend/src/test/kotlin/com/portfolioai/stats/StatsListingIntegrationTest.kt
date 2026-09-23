package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatEntryRequest
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatStatus
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
import org.springframework.data.domain.Sort
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * End-to-end integration test on [StatEntryService] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap) for the per-user stats sheet of #187.
 *
 * What it pins :
 * - **Multi-tenant scope** — another user's stat never shows in the listing and a foreign / missing
 *   id is a 404, never a 403 (we don't leak existence).
 * - **Listing** — default ordering `tradeDate desc` owned by the service (so a URL sort wins),
 *   pagination slices vs. totals.
 * - **Filters** — ticker query (case-insensitive), inclusive date range, pattern, and the
 *   completion status — the tick stored in `completed_at`, not the prices (#263).
 * - **CRUD** — the premarket + session blocks round-trip through the real `NUMERIC` columns, an
 *   edit overwrites the row, a delete removes it.
 * - **One stat per (user, day, ticker)** — a second create is a 409, and so is renaming a stat onto
 *   a slot the caller already holds.
 * - **Completion (#263)** — the session is saved field by field ; a stat is completed only when
 *   ticked, which needs the five prices, and a ticked stat can't lose a price.
 * - **By hand (#326)** — a stat typed on the stats page for a past day has no source candidate ; a
 *   future day is refused, and the one-per-day-and-ticker rule still holds.
 * - **No push (#302)** — a stat whose stock never pushed after the open is ticked with the four
 *   other prices, keeps no push price, stays out of the push references and can be filtered on.
 * - **KPIs** — [StatEntryService.summarise] counts completed / to complete over the whole filtered
 *   set and averages the derived percentages (never stored) of the completed rows only, plus the
 *   median / 3rd quartile / max push at open behind the candidates' « À l'open » card (#261).
 *
 * `AuthService` is overridden with `@MockitoBean` so the user scope is deterministic — same pattern
 * as `CandidateIntegrationTest`.
 */
@SpringBootTest
class StatsListingIntegrationTest {

  @Autowired private lateinit var service: StatEntryService
  @Autowired private lateinit var repo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  private val noFilter = StatEntryFilter()

  @BeforeEach
  fun setUp() {
    // Trades first : `trade_entry.stat_entry_id` is ON DELETE RESTRICT since #192, so a trade left
    // behind by another test class in the shared container would block the stat wipe.
    tradeRepo.deleteAll()
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = userRepository.save(makeUser("trader"))
    otherUser = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  // ---------------------------------------------------------------------------
  // Listing + multi-tenant scope
  // ---------------------------------------------------------------------------

  @Test
  fun `defaults to newest-first when the page request carries no sort`() {
    seedThreeStats()

    val page = service.findAllPaged(noFilter, PageRequest.of(0, 50))

    assertEquals(3, page.totalElements)
    assertEquals(listOf("SGBX", "KTTA", "BNZI"), page.content.map { it.ticker })
  }

  @Test
  fun `honours a user-supplied sort over the default`() {
    seedThreeStats()

    val page =
      service.findAllPaged(noFilter, PageRequest.of(0, 50, Sort.by(Sort.Order.asc("ticker"))))

    assertEquals(listOf("BNZI", "KTTA", "SGBX"), page.content.map { it.ticker })
  }

  @Test
  fun `paginates — page size bounds the slice while totalElements counts the whole dataset`() {
    seedThreeStats()

    val firstPage = service.findAllPaged(noFilter, PageRequest.of(0, 2))

    assertEquals(3, firstPage.totalElements)
    assertEquals(2, firstPage.totalPages)
    assertEquals(listOf("SGBX", "KTTA"), firstPage.content.map { it.ticker })

    val secondPage = service.findAllPaged(noFilter, PageRequest.of(1, 2))
    assertEquals(listOf("BNZI"), secondPage.content.map { it.ticker })
  }

  @Test
  fun `another user's stat never shows in the listing`() {
    seedThreeStats()
    repo.save(makeStat(otherUser, ticker = "SECRET", tradeDate = DAY))

    val mine = service.findAllPaged(noFilter, PageRequest.of(0, 50)).content.map { it.ticker }

    assertEquals(3, mine.size)
    assertFalse(mine.contains("SECRET"), "another user's stat must not leak")
  }

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------

  @Test
  fun `filters by ticker case-insensitively on a substring`() {
    seedThreeStats()

    val page = service.findAllPaged(StatEntryFilter(query = "ktt"), PageRequest.of(0, 50))

    assertEquals(listOf("KTTA"), page.content.map { it.ticker })
  }

  @Test
  fun `filters by an inclusive date range`() {
    seedThreeStats()

    val page =
      service.findAllPaged(
        StatEntryFilter(dateFrom = LocalDate.of(2026, 9, 16), dateTo = LocalDate.of(2026, 9, 17)),
        PageRequest.of(0, 50),
      )

    assertEquals(listOf("KTTA", "BNZI"), page.content.map { it.ticker }, "both bounds are included")
  }

  @Test
  fun `filters by pattern`() {
    seedThreeStats()

    val page = service.findAllPaged(StatEntryFilter(pattern = Pattern.DT), PageRequest.of(0, 50))

    assertEquals(listOf("SGBX"), page.content.map { it.ticker })
  }

  @Test
  fun `filters by completion status — a stat is completed only once ticked`() {
    seedThreeStats()

    val completed =
      service.findAllPaged(StatEntryFilter(status = StatStatus.COMPLETED), PageRequest.of(0, 50))
    val toComplete =
      service.findAllPaged(StatEntryFilter(status = StatStatus.TO_COMPLETE), PageRequest.of(0, 50))

    assertEquals(listOf("KTTA", "BNZI"), completed.content.map { it.ticker })
    assertEquals(listOf("SGBX"), toComplete.content.map { it.ticker })
  }

  @Test
  fun `a whole session block not ticked yet still counts as to complete`() {
    // Regression guard : the status is the tick, not "every price set" — the last price landing
    // must not complete the stat behind the owner's back.
    service.create(fullSessionRequest(ticker = "KTTA"))

    val toComplete =
      service.findAllPaged(StatEntryFilter(status = StatStatus.TO_COMPLETE), PageRequest.of(0, 50))

    assertEquals(listOf("KTTA"), toComplete.content.map { it.ticker })
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  @Test
  fun `create persists the premarket and session blocks and normalises the ticker`() {
    val created = service.create(fullSessionRequest(ticker = " ktta "))

    val reloaded = service.findById(created.id)
    assertEquals("KTTA", reloaded.ticker, "ticker is trimmed + upper-cased")
    assertEquals(Pattern.GUS, reloaded.pattern)
    assertEquals(0, BigDecimal("2.65").compareTo(reloaded.previousClose))
    assertEquals(0, BigDecimal("4.05").compareTo(reloaded.pmOpen))
    assertEquals(0, BigDecimal("4.65").compareTo(reloaded.pmHigh))
    assertEquals(0, BigDecimal("4.20").compareTo(reloaded.openPrice))
    assertEquals(0, BigDecimal("4.62").compareTo(reloaded.pushOpenPrice))
    assertEquals(0, BigDecimal("4.62").compareTo(reloaded.hodPrice))
    assertEquals(0, BigDecimal("3.41").compareTo(reloaded.lodPrice))
    assertEquals(0, BigDecimal("3.52").compareTo(reloaded.eodPrice))
    assertFalse(reloaded.completed, "the prices alone don't complete a stat — the tick does")
    assertNull(reloaded.candidateId, "no source candidate when the stat is not a promotion")
  }

  @Test
  fun `a stat created without a session block is stored as to complete`() {
    val created = service.create(premarketRequest(ticker = "SGBX"))

    assertFalse(created.completed)
    assertNull(created.openPrice)
    assertNull(created.pushOpenPrice)
    assertNull(created.hodPrice)
    assertNull(created.lodPrice)
    assertNull(created.eodPrice)
    assertFalse(created.ssr)
    assertFalse(created.under1Dollar)
    assertFalse(created.entryAfter11am)
  }

  @Test
  fun `update overwrites the whole row and bumps updatedAt`() {
    val created = service.create(premarketRequest(ticker = "KTTA"))
    Thread.sleep(10) // let the next now() fall on a later instant

    val updated =
      service.update(
        created.id,
        fullSessionRequest(ticker = "KTTA", ssr = true, entryAfter11am = true),
      )

    assertEquals(0, BigDecimal("3.52").compareTo(updated.eodPrice))
    assertTrue(updated.ssr)
    assertTrue(updated.entryAfter11am)
    assertTrue(updated.updatedAt.isAfter(created.updatedAt))
  }

  @Test
  fun `delete removes a stat and a second delete is a 404`() {
    val created = service.create(fullSessionRequest(ticker = "KTTA"))

    service.delete(created.id)
    assertNull(repo.findByIdAndUserId(created.id, testUser.id))

    val ex = assertThrows(ResponseStatusException::class.java) { service.delete(created.id) }
    assertEquals(404, ex.statusCode.value())
  }

  @Test
  fun `fetching, editing or deleting a foreign stat returns 404, not 403`() {
    val foreign = repo.save(makeStat(otherUser, ticker = "TSLA", tradeDate = DAY))

    val get = assertThrows(ResponseStatusException::class.java) { service.findById(foreign.id) }
    assertEquals(404, get.statusCode.value(), "must not leak existence — 404, never 403")

    val edit =
      assertThrows(ResponseStatusException::class.java) {
        service.update(foreign.id, fullSessionRequest(ticker = "TSLA"))
      }
    assertEquals(404, edit.statusCode.value())

    val remove = assertThrows(ResponseStatusException::class.java) { service.delete(foreign.id) }
    assertEquals(404, remove.statusCode.value())
    assertTrue(repo.findById(foreign.id).isPresent, "the foreign stat is still there")
  }

  @Test
  fun `a missing id is a 404`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) { service.findById(UUID.randomUUID()) }
    assertEquals(404, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // One stat per (user, day, ticker)
  // ---------------------------------------------------------------------------

  // A chart found three days later that matched the pattern : it goes in the stats anyway.
  @Test
  fun `a stat typed by hand for a past day is stored without a source candidate`() {
    val past = LocalDate.now().minusDays(3)

    val stat = service.createByHand(fullSessionRequest(ticker = "GLND", tradeDate = past))

    assertEquals(past, stat.tradeDate)
    assertNull(stat.candidateId)
    assertFalse(stat.completed, "ticked by hand, like any stat")
  }

  @Test
  fun `a stat typed by hand for a future day is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.createByHand(premarketRequest(tradeDate = LocalDate.now().plusDays(1)))
      }

    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `a stat typed by hand on a day and ticker already in the sheet is a 409`() {
    service.create(premarketRequest(ticker = "KTTA", tradeDate = LocalDate.now()))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.createByHand(premarketRequest(ticker = "KTTA", tradeDate = LocalDate.now()))
      }

    assertEquals(409, ex.statusCode.value())
  }

  @Test
  fun `creating a second stat for the same day and ticker is a 409`() {
    service.create(fullSessionRequest(ticker = "KTTA"))

    // Case-insensitive : the ticker is normalised before the check.
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(fullSessionRequest(ticker = "ktta"))
      }

    assertEquals(409, ex.statusCode.value())
    assertEquals(1, repo.count(), "no duplicate row")
  }

  @Test
  fun `renaming a stat onto a day-ticker the caller already holds is a 409`() {
    service.create(fullSessionRequest(ticker = "KTTA"))
    val other = service.create(fullSessionRequest(ticker = "BNZI"))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(other.id, fullSessionRequest(ticker = "KTTA"))
      }

    assertEquals(409, ex.statusCode.value())
  }

  @Test
  fun `updating a stat without changing its ticker is not a conflict with itself`() {
    val created = service.create(fullSessionRequest(ticker = "KTTA"))

    val updated =
      service.update(
        created.id,
        fullSessionRequest(ticker = "KTTA").copy(eodPrice = BigDecimal("3.60")),
      )

    assertEquals(0, BigDecimal("3.60").compareTo(updated.eodPrice))
  }

  @Test
  fun `the same day and ticker for another user is a separate stat`() {
    service.create(fullSessionRequest(ticker = "KTTA"))
    repo.save(makeStat(otherUser, ticker = "KTTA", tradeDate = DAY))

    assertEquals(1, service.findAllPaged(noFilter, PageRequest.of(0, 50)).totalElements)
  }

  // ---------------------------------------------------------------------------
  // Completion (#263)
  // ---------------------------------------------------------------------------

  @Test
  fun `the session can be saved one field at a time, in any order`() {
    val stat = service.create(premarketRequest(ticker = "SGBX"))

    // 9:30 the open, then the push once it happened, then a flag — each field left is a save.
    val open = premarketRequest(ticker = "SGBX").copy(openPrice = BigDecimal("1.90"))
    service.update(stat.id, open)
    val push = open.copy(pushOpenPrice = BigDecimal("2.20"), entryAfter11am = true)
    val saved = service.update(stat.id, push)

    assertEquals(0, BigDecimal("1.90").compareTo(saved.openPrice))
    assertEquals(0, BigDecimal("2.20").compareTo(saved.pushOpenPrice))
    assertNull(saved.hodPrice)
    assertTrue(saved.entryAfter11am)
    assertFalse(saved.completed)
  }

  @Test
  fun `ticking a stat with its five prices completes it, and unticking puts it back`() {
    val stat = service.create(fullSessionRequest(ticker = "KTTA"))

    assertTrue(service.setCompleted(stat.id, completed = true).completed)
    assertEquals(1, service.summarise(noFilter).completed)

    assertFalse(service.setCompleted(stat.id, completed = false).completed)
    assertEquals(1, service.summarise(noFilter).toComplete)
  }

  @Test
  fun `ticking a stat with a missing price is a 400 naming what is missing`() {
    val stat =
      service.create(fullSessionRequest(ticker = "SGBX").copy(hodPrice = null, eodPrice = null))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.setCompleted(stat.id, completed = true)
      }

    assertEquals(400, ex.statusCode.value())
    assertTrue(ex.reason!!.contains("HOD, EOD"), "got ${ex.reason}")
    assertFalse(service.findById(stat.id).completed)
  }

  @Test
  fun `a completed stat stays completed when edited with its five prices`() {
    val stat = createCompleted(fullSessionRequest(ticker = "KTTA"))

    val edited = service.update(stat.id, fullSessionRequest(ticker = "KTTA", ssr = true))

    assertTrue(edited.completed)
    assertTrue(edited.ssr)
  }

  @Test
  fun `clearing a price of a completed stat is a 400 — untick it first`() {
    val stat = createCompleted(fullSessionRequest(ticker = "KTTA"))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(stat.id, fullSessionRequest(ticker = "KTTA").copy(eodPrice = null))
      }

    assertEquals(400, ex.statusCode.value())
    val kept = service.findById(stat.id)
    assertTrue(kept.completed)
    assertEquals(0, BigDecimal("3.52").compareTo(kept.eodPrice), "the rejected edit left no trace")
  }

  // #305 : the HOD / LOD pair was the only check, so this set went in and could be ticked — a HOD
  // of 1 under a push of 10.06 is not a day, it is a typo.
  @Test
  fun `a price above the HOD is a 400, naming the price`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        // The issue's own case : a HOD under the prices it should contain, with no LOD to
        // trip the HOD / LOD rule first.
        service.create(
          fullSessionRequest(ticker = "NUKK").copy(hodPrice = BigDecimal("1.00"), lodPrice = null)
        )
      }

    assertEquals(400, ex.statusCode.value())
    assertTrue(ex.reason!!.contains("above the HOD"), "got ${ex.reason}")
  }

  // A row stored before the rule existed (#305) : ticking it would bless what a write refuses.
  @Test
  fun `ticking a stat whose prices leave the day is a 400`() {
    val stat = repo.save(makeStat(testUser, ticker = "NUKK", tradeDate = DAY))
    stat.openPrice = BigDecimal("4.20")
    stat.pushOpenPrice = BigDecimal("4.62")
    stat.hodPrice = BigDecimal("1.00")
    stat.lodPrice = BigDecimal("0.90")
    stat.eodPrice = BigDecimal("3.52")
    repo.save(stat)

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.setCompleted(stat.id, completed = true)
      }

    assertEquals(400, ex.statusCode.value())
    assertTrue(ex.reason!!.contains("above the HOD"), "got ${ex.reason}")
  }

  @Test
  fun `a price below the LOD is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(fullSessionRequest(ticker = "SOBR").copy(eodPrice = BigDecimal("0.10")))
      }

    assertEquals(400, ex.statusCode.value())
    assertTrue(ex.reason!!.contains("below the LOD"), "got ${ex.reason}")
  }

  @Test
  fun `a price at zero is a 400, not a filled price`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(fullSessionRequest(ticker = "CYN").copy(eodPrice = BigDecimal.ZERO))
      }

    assertEquals(400, ex.statusCode.value())
    assertTrue(ex.reason!!.contains("EOD"), "got ${ex.reason}")
  }

  // GLND, 2026-09-21 : dropped straight from the open, only came back up around 11 am.
  @Test
  fun `a no-push stat is ticked with the four other prices`() {
    val stat = service.create(noPushRequest())

    assertTrue(service.setCompleted(stat.id, completed = true).completed)
  }

  // #349 : a GUS is screened on low institutional ownership, so the flag rides along with the rest.
  @Test
  fun `the institutions flag is stored and given back like the other flags`() {
    val stat = service.create(premarketRequest(ticker = "NUKK").copy(highInstitutions = true))

    assertTrue(stat.highInstitutions)
    assertTrue(service.findById(stat.id).highInstitutions)
  }

  @Test
  fun `a no-push stat keeps no push price, even when one is sent`() {
    val stat = service.create(noPushRequest().copy(pushOpenPrice = BigDecimal("3.30")))

    assertTrue(stat.noPush)
    assertNull(stat.pushOpenPrice)
  }

  @Test
  fun `unticking no push on a completed stat is a 400 until the push is typed`() {
    val stat = createCompleted(noPushRequest())

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(stat.id, noPushRequest().copy(noPush = false))
      }

    assertEquals(400, ex.statusCode.value())
    assertTrue(ex.reason!!.contains("Push at open"), "got ${ex.reason}")
  }

  @Test
  fun `ticking a foreign stat returns 404, not 403`() {
    val foreign = repo.save(makeStat(otherUser, ticker = "TSLA", tradeDate = DAY))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.setCompleted(foreign.id, completed = true)
      }

    assertEquals(404, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  @Test
  fun `summarise counts the two buckets and averages the derived percentages of the completed rows`() {
    seedThreeStats()

    val summary = service.summarise(noFilter)

    assertEquals(2, summary.completed)
    assertEquals(1, summary.toComplete)
    // KTTA push at open +10.00 (4.20 -> 4.62), BNZI +5.17 (2.90 -> 3.05) -> average 7.59 (HALF_UP).
    assertEquals(0, BigDecimal("7.59").compareTo(summary.averagePushOpenPercent))
    // KTTA LOD -18.81 (3.41), BNZI -15.86 (2.44) -> average -17.34.
    assertEquals(0, BigDecimal("-17.34").compareTo(summary.averageLodPercent))
    // KTTA EOD -16.19 (3.52), BNZI -11.03 (2.58) -> average -13.61.
    assertEquals(0, BigDecimal("-13.61").compareTo(summary.averageEodPercent))
    assertEquals(2, summary.fadeCount, "both closed below their open — the GUS thesis playing out")
  }

  @Test
  fun `summarise gives the median, 3rd quartile and max push at open of the completed rows`() {
    seedThreeStats()

    val summary = service.summarise(noFilter)

    // Completed pushes : BNZI +5.17, KTTA +10.00 ; the stat to complete has none and weighs
    // nothing.
    assertEquals(0, BigDecimal("7.59").compareTo(summary.medianPushOpenPercent))
    // 5.17 + 0.75 * (10.00 - 5.17) = 8.7925 -> 8.79.
    assertEquals(0, BigDecimal("8.79").compareTo(summary.thirdQuartilePushOpenPercent))
    assertEquals(0, BigDecimal("10.00").compareTo(summary.maxPushOpenPercent))
  }

  @Test
  fun `summarise leaves the no-push days out of the push figures and counts them apart`() {
    seedThreeStats()
    createCompleted(noPushRequest())

    val summary = service.summarise(noFilter)

    assertEquals(3, summary.completed)
    assertEquals(1, summary.noPushCount)
    // Still KTTA +10.00 and BNZI +5.17 : a no-push day has no push to drag the average down.
    assertEquals(0, BigDecimal("7.59").compareTo(summary.averagePushOpenPercent))
    assertEquals(0, BigDecimal("7.59").compareTo(summary.medianPushOpenPercent))
    assertEquals(3, summary.fadeCount, "GLND closed under its open too")
  }

  @Test
  fun `filters on the no-push days`() {
    seedThreeStats()
    createCompleted(noPushRequest())

    val page = service.findAllPaged(StatEntryFilter(noPush = true), PageRequest.of(0, 10))

    assertEquals(listOf("GLND"), page.content.map { it.ticker })
  }

  @Test
  fun `summarise has no push reference without a completed stat`() {
    service.create(premarketRequest(ticker = "KTTA"))

    val summary = service.summarise(noFilter)

    assertNull(summary.medianPushOpenPercent)
    assertNull(summary.thirdQuartilePushOpenPercent)
    assertNull(summary.maxPushOpenPercent)
  }

  @Test
  fun `summarise honours the same filter as the listing`() {
    seedThreeStats()

    val september17 = service.summarise(StatEntryFilter(dateFrom = DAY, dateTo = DAY))

    assertEquals(1, september17.completed)
    assertEquals(0, september17.toComplete)
    assertEquals(0, BigDecimal("10.00").compareTo(september17.averagePushOpenPercent))
  }

  @Test
  fun `a stat that closed above its open is not counted as a fade`() {
    // ZVSA 11/09 of the mockup : the push never gave back, EOD +16 % over the open.
    createCompleted(
      fullSessionRequest(ticker = "ZVSA")
        .copy(
          openPrice = BigDecimal("3.55"),
          pushOpenPrice = BigDecimal("4.10"),
          hodPrice = BigDecimal("4.40"),
          lodPrice = BigDecimal("3.30"),
          eodPrice = BigDecimal("4.12"),
        )
    )

    val summary = service.summarise(noFilter)

    assertEquals(1, summary.completed)
    assertEquals(0, summary.fadeCount)
  }

  @Test
  fun `summarise over an empty sheet reports zeroes and null averages`() {
    val summary = service.summarise(noFilter)

    assertEquals(0, summary.completed)
    assertEquals(0, summary.toComplete)
    assertEquals(0, summary.fadeCount)
    assertNull(summary.averagePushOpenPercent, "no completed stat -> no average, not zero")
    assertNull(summary.averageLodPercent)
    assertNull(summary.averageEodPercent)
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * The three rows every listing test reads : two completed sessions (KTTA 17/09, BNZI 16/09) and
   * the day's stat still to complete (SGBX 18/09, tagged DT so the pattern filter has something to
   * bite on). Prices come from `mockup/stats.html`.
   */
  private fun seedThreeStats() {
    createCompleted(fullSessionRequest(ticker = "KTTA", tradeDate = DAY))
    createCompleted(
      fullSessionRequest(ticker = "BNZI", tradeDate = DAY.minusDays(1))
        .copy(
          previousClose = BigDecimal("1.85"),
          pmOpen = BigDecimal("2.99"),
          pmHigh = BigDecimal("3.37"),
          openPrice = BigDecimal("2.90"),
          pushOpenPrice = BigDecimal("3.05"),
          hodPrice = BigDecimal("3.05"),
          lodPrice = BigDecimal("2.44"),
          eodPrice = BigDecimal("2.58"),
        )
    )
    service.create(
      premarketRequest(ticker = "SGBX", tradeDate = DAY.plusDays(1), pattern = Pattern.DT)
    )
  }

  /** KTTA on 09/17, premarket block only — the shape a promotion creates before the 4 pm close. */
  /** A stat typed in full and ticked — what the KPIs count. */
  private fun createCompleted(request: StatEntryRequest) =
    service.setCompleted(service.create(request).id, completed = true)

  private fun premarketRequest(
    ticker: String = "KTTA",
    tradeDate: LocalDate = DAY,
    pattern: Pattern = Pattern.GUS,
  ) =
    StatEntryRequest(
      tradeDate = tradeDate,
      pattern = pattern,
      ticker = ticker,
      previousClose = BigDecimal("2.65"),
      pmOpen = BigDecimal("4.05"),
      pmHigh = BigDecimal("4.65"),
      floatMillions = BigDecimal("8.2"),
      volumeMillions = BigDecimal("3.1"),
      locatePerShare = BigDecimal("0.03"),
      note = "Push rejeté sous 4,65",
    )

  /** The same KTTA row, completed : open 4.20, push 4.62, HOD 4.62, LOD 3.41, EOD 3.52. */
  private fun fullSessionRequest(
    ticker: String = "KTTA",
    tradeDate: LocalDate = DAY,
    pattern: Pattern = Pattern.GUS,
    ssr: Boolean = false,
    entryAfter11am: Boolean = false,
  ) =
    premarketRequest(ticker = ticker, tradeDate = tradeDate, pattern = pattern)
      .copy(
        openPrice = BigDecimal("4.20"),
        pushOpenPrice = BigDecimal("4.62"),
        hodPrice = BigDecimal("4.62"),
        lodPrice = BigDecimal("3.41"),
        eodPrice = BigDecimal("3.52"),
        ssr = ssr,
        entryAfter11am = entryAfter11am,
      )

  /** GLND : open 3.10, no push, HOD 3.10 (the open), LOD 2.41, EOD 2.66. */
  private fun noPushRequest() =
    premarketRequest(ticker = "GLND")
      .copy(
        openPrice = BigDecimal("3.10"),
        noPush = true,
        hodPrice = BigDecimal("3.10"),
        lodPrice = BigDecimal("2.41"),
        eodPrice = BigDecimal("2.66"),
      )

  private fun makeStat(owner: User, ticker: String, tradeDate: LocalDate) =
    StatEntry(
      user = owner,
      tradeDate = tradeDate,
      ticker = ticker,
      previousClose = BigDecimal("2.65"),
      pmOpen = BigDecimal("4.05"),
      pmHigh = BigDecimal("4.65"),
    )

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )

  private companion object {
    /** KTTA's day — the example of `mockup/PARCOURS.md › Étape 1`. */
    val DAY: LocalDate = LocalDate.of(2026, 9, 17)
  }
}
