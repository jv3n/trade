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
import com.portfolioai.stats.domain.StatRejectionReason
import com.portfolioai.stats.domain.StatReview
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.domain.StatStatus
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
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
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.PageRequest
import org.springframework.http.HttpStatus
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * Pins the review of a scanner stat (#762) : ts-scanner drops the previous session's GUS and double
 * tops as stats **to review** (#760), and the owner validates or rejects each one.
 *
 * What is protected here :
 *
 * - a manual stat reads `MANUAL`, has no review and nothing to review — every review action on it
 *   is a 400 ;
 * - **validating does not tick** : a validated stat is an ordinary stat to complete, ticked once
 *   its figures are right ; a stat to review can't be ticked, and the database backs it up ;
 * - a rejected stat is **kept**, with an optional reason of its pattern — hidden from every listing
 *   but « Rejetées », and given back to review by « restore », which also undoes a validation ;
 * - **a stat to review or rejected is in no figure** : not in the summary's counts nor its traded
 *   pair, nor in the rule score — only in the summary's `toReview` ;
 * - editing a stat to review keeps it to review : only Valider validates.
 */
@SpringBootTest
class StatReviewIntegrationTest {

  @Autowired private lateinit var service: StatEntryService
  @Autowired private lateinit var repo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    tradeRepo.deleteAll()
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  // ---------------------------------------------------------------------------
  // Source
  // ---------------------------------------------------------------------------

  @Test
  fun `a stat typed by hand reads manual, with no review`() {
    val stat = service.findById(repo.save(gus(testUser, "KTTA", StatSource.MANUAL)).id)

    assertEquals(StatSource.MANUAL, stat.source)
    assertNull(stat.review)
    assertNull(stat.rejectionReason)
  }

  @Test
  fun `a manual stat has nothing to review — validate, reject and restore are a 400`() {
    val manual = repo.save(gus(testUser, "KTTA", StatSource.MANUAL))

    listOf(
        { service.validate(manual.id) },
        { service.reject(manual.id, null) },
        { service.restore(manual.id) },
      )
      .forEach { action -> assertStatus(HttpStatus.BAD_REQUEST, action) }
  }

  @Test
  fun `a scanner stat is born to review`() {
    val stat = service.findById(repo.save(gus(testUser, "NXTP")).id)

    assertEquals(StatSource.SCANNER, stat.source)
    assertEquals(StatReview.TO_REVIEW, stat.review)
  }

  // ---------------------------------------------------------------------------
  // Validate
  // ---------------------------------------------------------------------------

  @Test
  fun `validating makes a stat to complete, ticked afterwards like any other`() {
    val scanned = repo.save(gus(testUser, "NXTP"))

    val validated = service.validate(scanned.id)
    assertEquals(StatReview.VALIDATED, validated.review)
    assertFalse(validated.completed)

    assertTrue(service.setCompleted(scanned.id, true).completed)
  }

  @Test
  fun `a stat to review can't be ticked, even with its whole session`() {
    val scanned = repo.save(gus(testUser, "NXTP"))

    assertStatus(HttpStatus.BAD_REQUEST) { service.setCompleted(scanned.id, true) }
  }

  @Test
  fun `the database refuses a ticked stat to review, and a review on a manual stat`() {
    assertThrows(DataIntegrityViolationException::class.java) {
      repo.saveAndFlush(gus(testUser, "NXTP").apply { completedAt = Instant.now() })
    }
    assertThrows(DataIntegrityViolationException::class.java) {
      repo.saveAndFlush(
        gus(testUser, "ICCT", StatSource.MANUAL).apply { review = StatReview.VALIDATED }
      )
    }
  }

  @Test
  fun `the database refuses a reason of the other pattern`() {
    assertThrows(DataIntegrityViolationException::class.java) {
      repo.saveAndFlush(
        gus(testUser, "NXTP").apply {
          review = StatReview.REJECTED
          rejectionReason = StatRejectionReason.BREAKOUT
        }
      )
    }
  }

  @Test
  fun `a rejected stat is restored before it is validated`() {
    val scanned = repo.save(gus(testUser, "NXTP"))
    service.reject(scanned.id, null)

    assertStatus(HttpStatus.BAD_REQUEST) { service.validate(scanned.id) }
  }

  @Test
  fun `editing a stat to review keeps it to review — only Valider validates`() {
    val scanned = repo.save(gus(testUser, "NXTP"))

    val edited =
      service.update(
        scanned.id,
        StatEntryRequest(
          tradeDate = scanned.tradeDate,
          ticker = "NXTP",
          previousClose = BigDecimal("2.65"),
          pmOpen = BigDecimal("4.05"),
          pmHigh = BigDecimal("4.65"),
          note = "Clean gap, no news.",
          openPrice = BigDecimal("4.20"),
        ),
      )

    assertEquals(StatReview.TO_REVIEW, edited.review)
  }

  // ---------------------------------------------------------------------------
  // Reject and restore
  // ---------------------------------------------------------------------------

  @Test
  fun `rejecting keeps the stat with its reason, and a second rejection changes it`() {
    val scanned = repo.save(doubleTop(testUser, "ATXG"))

    service.reject(scanned.id, StatRejectionReason.BREAKOUT)
    val again = service.reject(scanned.id, StatRejectionReason.NOISE)

    assertEquals(StatReview.REJECTED, again.review)
    assertEquals(StatRejectionReason.NOISE, again.rejectionReason)
    assertTrue(repo.existsById(scanned.id))
  }

  @Test
  fun `a stat is rejected without a reason`() {
    val scanned = repo.save(gus(testUser, "NXTP"))

    val rejected = service.reject(scanned.id, null)

    assertEquals(StatReview.REJECTED, rejected.review)
    assertNull(rejected.rejectionReason)
  }

  @Test
  fun `a reason of the other pattern is a 400 — a GUS is not rejected as a breakout`() {
    val gus = repo.save(gus(testUser, "NXTP"))
    val dt = repo.save(doubleTop(testUser, "BNRG"))

    assertStatus(HttpStatus.BAD_REQUEST) { service.reject(gus.id, StatRejectionReason.BREAKOUT) }
    assertStatus(HttpStatus.BAD_REQUEST) { service.reject(dt.id, StatRejectionReason.NEWS) }
  }

  @Test
  fun `a validated stat goes back to review before it is rejected`() {
    val scanned = repo.save(gus(testUser, "NXTP"))
    service.validate(scanned.id)

    assertStatus(HttpStatus.BAD_REQUEST) { service.reject(scanned.id, null) }
  }

  @Test
  fun `restoring a rejected stat puts it back to review and drops its reason`() {
    val scanned = repo.save(doubleTop(testUser, "ATXG"))
    service.reject(scanned.id, StatRejectionReason.BREAKOUT)

    val restored = service.restore(scanned.id)

    assertEquals(StatReview.TO_REVIEW, restored.review)
    assertNull(restored.rejectionReason)
  }

  @Test
  fun `« Repasser à relire » undoes a validation, but a ticked stat is unticked first`() {
    val scanned = repo.save(gus(testUser, "NXTP"))
    service.validate(scanned.id)
    assertEquals(StatReview.TO_REVIEW, service.restore(scanned.id).review)

    service.validate(scanned.id)
    service.setCompleted(scanned.id, true)
    assertStatus(HttpStatus.BAD_REQUEST) { service.restore(scanned.id) }
  }

  @Test
  fun `reviewing a foreign stat returns 404, not 403`() {
    val foreign = repo.save(gus(otherUser, "NXTP"))

    listOf(
        { service.validate(foreign.id) },
        { service.reject(foreign.id, null) },
        { service.restore(foreign.id) },
      )
      .forEach { action -> assertStatus(HttpStatus.NOT_FOUND, action) }
  }

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  @Test
  fun `a rejected stat is hidden from the listing, but from « Rejetées »`() {
    repo.save(gus(testUser, "KTTA", StatSource.MANUAL))
    repo.save(gus(testUser, "NXTP"))
    val rejected = repo.save(gus(testUser, "ICCT"))
    service.reject(rejected.id, StatRejectionReason.NEWS)

    assertEquals(setOf("KTTA", "NXTP"), tickers(StatEntryFilter()))
    assertEquals(setOf("KTTA", "NXTP", "ICCT"), tickers(StatEntryFilter(withRejected = true)))
    assertEquals(setOf("ICCT"), tickers(StatEntryFilter(review = StatReview.REJECTED)))
  }

  @Test
  fun `a derived filter, paged in memory, hides a rejected stat too`() {
    // under1Dollar is read off the prices, not in SQL : the in-memory paging must still drop it.
    repo.save(gus(testUser, "MULN").apply { openPrice = BigDecimal("0.8800") })
    val rejected = repo.save(gus(testUser, "ICCT").apply { openPrice = BigDecimal("0.7500") })
    service.reject(rejected.id, StatRejectionReason.NOISE)

    assertEquals(setOf("MULN"), tickers(StatEntryFilter(under1Dollar = true)))
    assertEquals(
      setOf("MULN", "ICCT"),
      tickers(StatEntryFilter(under1Dollar = true, withRejected = true)),
    )
  }

  @Test
  fun `« À relire » keeps the scanner stats to review only`() {
    repo.save(gus(testUser, "KTTA", StatSource.MANUAL))
    repo.save(gus(testUser, "NXTP"))
    repo.save(doubleTop(testUser, "BNRG"))
    service.validate(repo.save(doubleTop(testUser, "PRSO")).id)

    assertEquals(setOf("NXTP", "BNRG"), tickers(StatEntryFilter(review = StatReview.TO_REVIEW)))
  }

  @Test
  fun `« À compléter » leaves a stat to review out, and takes it once validated`() {
    repo.save(gus(testUser, "KTTA", StatSource.MANUAL))
    val scanned = repo.save(gus(testUser, "NXTP"))
    val toComplete = StatEntryFilter(status = StatStatus.TO_COMPLETE)

    assertEquals(setOf("KTTA"), tickers(toComplete))

    service.validate(scanned.id)
    assertEquals(setOf("KTTA", "NXTP"), tickers(toComplete))
  }

  @Test
  fun `« À compléter » with « Rejetées » on still leaves a rejected stat out — it never will be`() {
    repo.save(gus(testUser, "KTTA", StatSource.MANUAL))
    service.reject(repo.save(gus(testUser, "ICCT")).id, StatRejectionReason.NEWS)

    val listed = tickers(StatEntryFilter(status = StatStatus.TO_COMPLETE, withRejected = true))

    assertEquals(setOf("KTTA"), listed)
  }

  // ---------------------------------------------------------------------------
  // Figures
  // ---------------------------------------------------------------------------

  @Test
  fun `a stat to review or rejected is in no figure of the summary, only in « to review »`() {
    val manual = repo.save(gus(testUser, "KTTA", StatSource.MANUAL))
    val toReview = repo.save(gus(testUser, "NXTP"))
    service.reject(repo.save(gus(testUser, "ICCT")).id, null)
    service.promoteToTrade(manual.id)
    // A trade of the day joins its stat (#732), even one still to review.
    service.promoteToTrade(toReview.id)

    // « Rejetées » on : the rejected stat is listed, and still out of the figures.
    val summary = service.summarise(StatEntryFilter(pattern = Pattern.GUS, withRejected = true))

    assertEquals(0, summary.completed)
    assertEquals(1, summary.toComplete)
    assertEquals(1, summary.toReview)
    assertEquals(1, summary.traded)
    assertEquals(0, summary.untraded)
  }

  @Test
  fun `a validated stat counts like a manual one`() {
    service.validate(repo.save(gus(testUser, "NXTP")).id)

    val summary = service.summarise(StatEntryFilter(pattern = Pattern.GUS))

    assertEquals(1, summary.toComplete)
    assertEquals(0, summary.toReview)
  }

  @Test
  fun `the rule score reads the validated stats, never one to review`() {
    val validated = repo.save(gus(testUser, "NXTP", tradeDate = recent()))
    service.validate(validated.id)
    service.setCompleted(validated.id, true)
    repo.save(gus(testUser, "ICCT", tradeDate = recent()))

    assertEquals(1, service.scoreRules(1).completed)
  }

  // ---------------------------------------------------------------------------

  private fun tickers(filter: StatEntryFilter): Set<String> =
    service.findAllPaged(filter, PageRequest.of(0, 50)).content.map { it.ticker }.toSet()

  private fun assertStatus(status: HttpStatus, action: () -> Any) {
    val error = assertThrows(ResponseStatusException::class.java) { action() }
    assertEquals(status.value(), error.statusCode.value())
  }

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

  private fun recent() = LocalDate.now().minusDays(3)

  /** A GUS with its whole session — dropped by the scanner unless told otherwise. */
  private fun gus(
    user: User,
    ticker: String,
    source: StatSource = StatSource.SCANNER,
    tradeDate: LocalDate = LocalDate.of(2026, 9, 18),
  ) =
    StatEntry(
        user = user,
        tradeDate = tradeDate,
        ticker = ticker,
        source = source,
        review = StatReview.TO_REVIEW.takeIf { source == StatSource.SCANNER },
        previousClose = BigDecimal("2.6500"),
        pmOpen = BigDecimal("4.0500"),
        pmHigh = BigDecimal("4.6500"),
      )
      .apply {
        openPrice = BigDecimal("4.2000")
        pushOpenPrice = BigDecimal("4.6200")
        hodPrice = BigDecimal("4.6200")
        lodPrice = BigDecimal("3.4100")
        eodPrice = BigDecimal("3.5200")
      }

  /** A scanner double top with its five points, as the detector reads them. */
  private fun doubleTop(user: User, ticker: String) =
    StatEntry(
        user = user,
        tradeDate = LocalDate.of(2026, 9, 18),
        pattern = Pattern.DT,
        ticker = ticker,
        source = StatSource.SCANNER,
        review = StatReview.TO_REVIEW,
      )
      .apply {
        dtStartPrice = BigDecimal("2.1000")
        dtStartTime = LocalTime.of(10, 5)
        dtTopPrice = BigDecimal("3.3000")
        dtTopTime = LocalTime.of(10, 16)
        dtLowPrice = BigDecimal("2.6800")
        dtLowTime = LocalTime.of(10, 24)
        dtRetestPrice = BigDecimal("3.2100")
        dtRetestTime = LocalTime.of(10, 41)
        dtDropPrice = BigDecimal("2.7200")
        dtDropTime = LocalTime.of(11, 12)
      }
}
