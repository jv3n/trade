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
 *   completion status, which has no column : "completed" means the five session prices are set.
 * - **CRUD** — the premarket + session blocks round-trip through the real `NUMERIC` columns, an
 *   edit overwrites the row, a delete removes it.
 * - **One stat per (user, day, ticker)** — a second create is a 409, and so is renaming a stat onto
 *   a slot the caller already holds.
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
  fun `filters by completion status — a stat is completed only once the five session prices are in`() {
    seedThreeStats()

    val completed =
      service.findAllPaged(StatEntryFilter(status = StatStatus.COMPLETED), PageRequest.of(0, 50))
    val toComplete =
      service.findAllPaged(StatEntryFilter(status = StatStatus.TO_COMPLETE), PageRequest.of(0, 50))

    assertEquals(listOf("KTTA", "BNZI"), completed.content.map { it.ticker })
    assertEquals(listOf("SGBX"), toComplete.content.map { it.ticker })
  }

  @Test
  fun `a half-filled session block still counts as to complete`() {
    // Regression guard : the status is "every price set", not "any price set" — a stat abandoned
    // mid-entry must stay in the to-complete bucket.
    service.create(completedRequest(ticker = "KTTA").copy(eodPrice = null))

    val toComplete =
      service.findAllPaged(StatEntryFilter(status = StatStatus.TO_COMPLETE), PageRequest.of(0, 50))

    assertEquals(listOf("KTTA"), toComplete.content.map { it.ticker })
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  @Test
  fun `create persists the premarket and session blocks and normalises the ticker`() {
    val created = service.create(completedRequest(ticker = " ktta "))

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
    assertTrue(reloaded.completed)
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

    val completed =
      service.update(
        created.id,
        completedRequest(ticker = "KTTA", ssr = true, entryAfter11am = true),
      )

    assertTrue(completed.completed, "the session block turns the stat into a completed one")
    assertEquals(0, BigDecimal("3.52").compareTo(completed.eodPrice))
    assertTrue(completed.ssr)
    assertTrue(completed.entryAfter11am)
    assertTrue(completed.updatedAt.isAfter(created.updatedAt))
  }

  @Test
  fun `delete removes a stat and a second delete is a 404`() {
    val created = service.create(completedRequest(ticker = "KTTA"))

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
        service.update(foreign.id, completedRequest(ticker = "TSLA"))
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

  @Test
  fun `creating a second stat for the same day and ticker is a 409`() {
    service.create(completedRequest(ticker = "KTTA"))

    // Case-insensitive : the ticker is normalised before the check.
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(completedRequest(ticker = "ktta"))
      }

    assertEquals(409, ex.statusCode.value())
    assertEquals(1, repo.count(), "no duplicate row")
  }

  @Test
  fun `renaming a stat onto a day-ticker the caller already holds is a 409`() {
    service.create(completedRequest(ticker = "KTTA"))
    val other = service.create(completedRequest(ticker = "BNZI"))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(other.id, completedRequest(ticker = "KTTA"))
      }

    assertEquals(409, ex.statusCode.value())
  }

  @Test
  fun `updating a stat without changing its ticker is not a conflict with itself`() {
    val created = service.create(completedRequest(ticker = "KTTA"))

    val updated =
      service.update(
        created.id,
        completedRequest(ticker = "KTTA").copy(eodPrice = BigDecimal("3.60")),
      )

    assertEquals(0, BigDecimal("3.60").compareTo(updated.eodPrice))
  }

  @Test
  fun `the same day and ticker for another user is a separate stat`() {
    service.create(completedRequest(ticker = "KTTA"))
    repo.save(makeStat(otherUser, ticker = "KTTA", tradeDate = DAY))

    assertEquals(1, service.findAllPaged(noFilter, PageRequest.of(0, 50)).totalElements)
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
    service.create(
      completedRequest(ticker = "ZVSA")
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
    service.create(completedRequest(ticker = "KTTA", tradeDate = DAY))
    service.create(
      completedRequest(ticker = "BNZI", tradeDate = DAY.minusDays(1))
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
  private fun completedRequest(
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
