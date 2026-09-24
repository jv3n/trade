package com.portfolioai.candidates

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.candidates.application.CandidateService
import com.portfolioai.candidates.application.dto.CandidateRequest
import com.portfolioai.candidates.domain.Candidate
import com.portfolioai.candidates.infrastructure.persistence.CandidateRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatEntryRequest
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
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * End-to-end integration test on [CandidateService] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap, no per-class plumbing) for the **morning capture** model (#186).
 *
 * What it pins :
 * - **Save round-trip** — the ticker is normalised, every premarket field and the pattern (Postgres
 *   `pattern` ENUM) persist, a blank note is stored as null, and the pattern defaults to GUS.
 * - **One candidate per (day, ticker)** — a second capture, or renaming onto a captured ticker, is
 *   a 409 ; the same ticker on another day or another user is fine.
 * - **In-service validation** — non-positive prices, a PM high below the PM open, a negative float
 *   / volume / locate and a blank ticker return a clean 400, not a DB CHECK violation.
 * - **Day listing** — only the requested day's candidates come back.
 * - **Multi-tenant scope** — a foreign / missing id → 404 (never 403).
 * - **Promotion to the stats sheet (#189)** — promoting copies the whole premarket block onto a new
 *   stat that starts "to complete" and points back at the candidate, which then reports `promoted =
 *   true` ; promoting twice is a 409, and « Tout passer en stats » is idempotent — candidates
 *   already in the sheet (through their promotion or through an unrelated stat holding that (day,
 *   ticker) slot) come back in `skipped` without failing the batch.
 * - **The « À l'open » card (#261)** — the open is optional and positive, copied onto the stat on
 *   promotion ; typed after the promotion, it fills the stat only while the stat has no open of its
 *   own, and the stat keeps it once the candidate is deleted. The target push is optional and
 *   non-negative, and clearing it puts the row back on the card's reference.
 *
 * `AuthService` is overridden with `@MockitoBean` so the user-scope is deterministic.
 */
@SpringBootTest
class CandidateIntegrationTest {

  @Autowired private lateinit var service: CandidateService
  @Autowired private lateinit var repo: CandidateRepository
  @Autowired private lateinit var statService: StatEntryService
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    // Stats first : they reference both the candidate and the user.
    // Trades first : `trade_entry.stat_entry_id` is ON DELETE RESTRICT since #192, so a trade left
    // behind by another test class in the shared container would block the stat wipe.
    tradeRepo.deleteAll()
    statRepo.deleteAll()
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = userRepository.save(makeUser("trader"))
    otherUser = userRepository.save(makeUser("other"))
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  // ---------------------------------------------------------------------------
  // Save round-trip
  // ---------------------------------------------------------------------------

  @Test
  fun `create normalises the ticker and persists every premarket field`() {
    val saved =
      service.create(
        request(
          ticker = " ktta ",
          pattern = Pattern.DT,
          floatMillions = BigDecimal("8.2"),
          volumeMillions = BigDecimal("3.1"),
          locatePerShare = BigDecimal("0.03"),
          note = "  Résistance 4,65 — high PM, pas de news  ",
        )
      )

    val reloaded = service.findById(saved.id)
    assertEquals("KTTA", reloaded.ticker, "ticker is trimmed + upper-cased")
    assertEquals(Pattern.DT, reloaded.pattern, "the pattern survives the Postgres ENUM round-trip")
    assertEquals(0, BigDecimal("2.65").compareTo(reloaded.previousClose))
    assertEquals(0, BigDecimal("4.05").compareTo(reloaded.pmOpen))
    assertEquals(0, BigDecimal("4.65").compareTo(reloaded.pmHigh))
    assertEquals(0, BigDecimal("8.2").compareTo(reloaded.floatMillions))
    assertEquals(0, BigDecimal("3.1").compareTo(reloaded.volumeMillions))
    assertEquals(0, BigDecimal("0.03").compareTo(reloaded.locatePerShare))
    assertEquals("Résistance 4,65 — high PM, pas de news", reloaded.note, "note is trimmed")
  }

  @Test
  fun `the pattern defaults to GUS and the optional context stays null`() {
    val saved =
      service.create(
        CandidateRequest(
          tradingDate = DAY,
          ticker = "KTTA",
          previousClose = BigDecimal("2.65"),
          pmOpen = BigDecimal("4.05"),
          pmHigh = BigDecimal("4.65"),
          note = "   ",
        )
      )

    assertEquals(Pattern.GUS, saved.pattern)
    assertNull(saved.floatMillions)
    assertNull(saved.volumeMillions)
    assertNull(saved.locatePerShare)
    assertNull(saved.note, "a blank note is stored as null")
  }

  // ---------------------------------------------------------------------------
  // One candidate per (day, ticker)
  // ---------------------------------------------------------------------------

  @Test
  fun `capturing the same ticker twice on the same day is a 409`() {
    service.create(request(ticker = "KTTA"))

    // Case-insensitive : the ticker is normalised before the check.
    val ex =
      assertThrows(ResponseStatusException::class.java) { service.create(request(ticker = "ktta")) }
    assertEquals(409, ex.statusCode.value())
    assertEquals(1, service.listForDate(DAY).size, "no duplicate row")
  }

  @Test
  fun `the same ticker on another day or for another user is a separate candidate`() {
    service.create(request(ticker = "KTTA", tradingDate = DAY))
    service.create(request(ticker = "KTTA", tradingDate = DAY.minusDays(1)))
    repo.save(makeCandidate(otherUser, "KTTA"))

    assertEquals(1, service.listForDate(DAY).size)
    assertEquals(1, service.listForDate(DAY.minusDays(1)).size)
  }

  @Test
  fun `renaming a candidate onto a ticker already captured that day is a 409`() {
    service.create(request(ticker = "KTTA"))
    val other = service.create(request(ticker = "SGBX"))

    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.update(other.id, request(ticker = "KTTA"))
      }
    assertEquals(409, ex.statusCode.value())
  }

  @Test
  fun `updating a candidate without changing its ticker is not a conflict with itself`() {
    val created = service.create(request(ticker = "KTTA"))

    val updated = service.update(created.id, request(ticker = "KTTA", pmHigh = BigDecimal("4.90")))

    assertEquals(0, BigDecimal("4.90").compareTo(updated.pmHigh))
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  @Test
  fun `a non-positive previous close, PM open or PM high is a 400`() {
    listOf(
        request(previousClose = BigDecimal.ZERO),
        request(pmOpen = BigDecimal("-1")),
        request(pmHigh = BigDecimal.ZERO),
      )
      .forEach { invalid ->
        val ex = assertThrows(ResponseStatusException::class.java) { service.create(invalid) }
        assertEquals(400, ex.statusCode.value())
      }
  }

  @Test
  fun `a PM high below the PM open is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(pmOpen = BigDecimal("4.05"), pmHigh = BigDecimal("3.90")))
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `a negative float, volume or locate is a 400`() {
    listOf(
        request(floatMillions = BigDecimal("-1")),
        request(volumeMillions = BigDecimal("-0.5")),
        request(locatePerShare = BigDecimal("-0.01")),
      )
      .forEach { invalid ->
        val ex = assertThrows(ResponseStatusException::class.java) { service.create(invalid) }
        assertEquals(400, ex.statusCode.value())
      }
  }

  @Test
  fun `a blank ticker is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) { service.create(request(ticker = "   ")) }
    assertEquals(400, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Day listing
  // ---------------------------------------------------------------------------

  @Test
  fun `listForDate returns only the requested day's candidates, ticker-ascending`() {
    service.create(request(ticker = "SGBX", tradingDate = DAY))
    service.create(request(ticker = "BNRG", tradingDate = DAY))
    service.create(request(ticker = "KTTA", tradingDate = DAY.minusDays(1)))

    val day = service.listForDate(DAY)

    assertEquals(listOf("BNRG", "SGBX"), day.map { it.ticker })
  }

  // ---------------------------------------------------------------------------
  // Update + multi-tenant scope
  // ---------------------------------------------------------------------------

  @Test
  fun `update overwrites fields and bumps updatedAt`() {
    val created = service.create(request(ticker = "KTTA"))
    Thread.sleep(10) // let the next now() fall on a later instant

    val updated =
      service.update(
        created.id,
        request(ticker = "SGBX", pattern = Pattern.DISCRETIONARY, pmOpen = BigDecimal("4.20")),
      )

    assertEquals("SGBX", updated.ticker)
    assertEquals(Pattern.DISCRETIONARY, updated.pattern)
    assertEquals(0, BigDecimal("4.20").compareTo(updated.pmOpen))
    assertTrue(updated.updatedAt.isAfter(created.updatedAt))
  }

  @Test
  fun `fetching or editing a foreign candidate returns 404, not 403`() {
    val foreign = repo.save(makeCandidate(otherUser, "TSLA"))

    val get = assertThrows(ResponseStatusException::class.java) { service.findById(foreign.id) }
    assertEquals(404, get.statusCode.value(), "must not leak existence — 404, never 403")

    val edit =
      assertThrows(ResponseStatusException::class.java) {
        service.update(foreign.id, request(ticker = "TSLA"))
      }
    assertEquals(404, edit.statusCode.value())
  }

  @Test
  fun `delete removes a candidate and a second delete is a 404`() {
    val created = service.create(request(ticker = "KTTA"))

    service.delete(created.id)
    assertNull(repo.findByIdAndUserId(created.id, testUser.id))

    val ex = assertThrows(ResponseStatusException::class.java) { service.delete(created.id) }
    assertEquals(404, ex.statusCode.value())
  }

  // ---------------------------------------------------------------------------
  // Promotion to the stats sheet (#189)
  // ---------------------------------------------------------------------------

  @Test
  fun `promote copies the whole premarket block onto a new stat that starts to complete`() {
    val candidate =
      service.create(
        request(
          ticker = "KTTA",
          pattern = Pattern.DT,
          floatMillions = BigDecimal("8.2"),
          volumeMillions = BigDecimal("3.1"),
          locatePerShare = BigDecimal("0.03"),
          note = "Push rejeté sous 4,65",
        )
      )

    val stat = service.promote(candidate.id)

    assertEquals(candidate.id, stat.candidateId, "the stat keeps a trace of its source candidate")
    assertEquals(DAY, stat.tradeDate)
    assertEquals("KTTA", stat.ticker)
    assertEquals(Pattern.DT, stat.pattern, "the candidate's pattern follows it to the sheet")
    assertEquals(0, BigDecimal("2.65").compareTo(stat.previousClose))
    assertEquals(0, BigDecimal("4.05").compareTo(stat.pmOpen))
    assertEquals(0, BigDecimal("4.65").compareTo(stat.pmHigh))
    assertEquals(0, BigDecimal("8.2").compareTo(stat.floatMillions))
    assertEquals(0, BigDecimal("3.1").compareTo(stat.volumeMillions))
    assertEquals(0, BigDecimal("0.03").compareTo(stat.locatePerShare))
    assertEquals("Push rejeté sous 4,65", stat.note)

    assertFalse(stat.completed, "the session block is only filled after the 4 pm close")
    assertNull(stat.openPrice)
    assertNull(stat.pushOpenPrice)
    assertNull(stat.hodPrice)
    assertNull(stat.lodPrice)
    assertNull(stat.eodPrice)
  }

  @Test
  fun `a promoted candidate reports promoted in the listing and in findById`() {
    val promotedOne = service.create(request(ticker = "KTTA"))
    val untouched = service.create(request(ticker = "SGBX"))

    service.promote(promotedOne.id)

    assertFalse(promotedOne.promoted, "the capture itself is never born promoted")
    assertTrue(service.findById(promotedOne.id).promoted)
    assertFalse(service.findById(untouched.id).promoted)
    assertEquals(
      mapOf("KTTA" to true, "SGBX" to false),
      service.listForDate(DAY).associate { it.ticker to it.promoted },
    )
  }

  @Test
  fun `a promoted candidate points at the stat it became, for the in-stats link`() {
    val candidate = service.create(request(ticker = "KTTA"))
    // Read back through the listing : `create` builds its answer without asking for the stat.
    assertNull(service.listForDate(DAY).single().statId, "no stat before promotion")

    val stat = service.promote(candidate.id)

    assertEquals(stat.id, service.findById(candidate.id).statId)
    assertEquals(stat.id, service.listForDate(DAY).single().statId)
  }

  @Test
  fun `promoting the same candidate twice is a 409`() {
    val candidate = service.create(request(ticker = "KTTA"))
    service.promote(candidate.id)

    val ex = assertThrows(ResponseStatusException::class.java) { service.promote(candidate.id) }

    assertEquals(409, ex.statusCode.value())
    assertEquals(1, statRepo.count(), "no duplicate stat")
  }

  @Test
  fun `promoting a candidate whose day and ticker is already taken by another stat is a 409`() {
    val candidate = service.create(request(ticker = "KTTA"))
    statService.create(statRequest(ticker = "KTTA"))

    val ex = assertThrows(ResponseStatusException::class.java) { service.promote(candidate.id) }

    assertEquals(409, ex.statusCode.value())
    assertEquals(1, statRepo.count(), "the slot keeps the stat that was already there")
  }

  @Test
  fun `promoting a foreign or missing candidate returns 404, not 403`() {
    val foreign = repo.save(makeCandidate(otherUser, "TSLA"))

    val stranger = assertThrows(ResponseStatusException::class.java) { service.promote(foreign.id) }
    assertEquals(404, stranger.statusCode.value(), "must not leak existence — 404, never 403")

    val missing =
      assertThrows(ResponseStatusException::class.java) { service.promote(UUID.randomUUID()) }
    assertEquals(404, missing.statusCode.value())
    assertEquals(0, statRepo.count(), "nothing reached the sheet")
  }

  @Test
  fun `promoteDay promotes every candidate of that day and leaves the other days alone`() {
    service.create(request(ticker = "SGBX", tradingDate = DAY))
    service.create(request(ticker = "BNRG", tradingDate = DAY))
    val yesterday = service.create(request(ticker = "KTTA", tradingDate = DAY.minusDays(1)))

    val outcome = service.promoteDay(DAY)

    assertEquals(listOf("BNRG", "SGBX"), outcome.promoted, "ticker-ascending, like the listing")
    assertEquals(emptyList<String>(), outcome.skipped)
    assertEquals(2, statRepo.count())
    assertFalse(service.findById(yesterday.id).promoted, "another day is untouched")
  }

  @Test
  fun `promoteDay is idempotent — a second run promotes nothing and reports the day as skipped`() {
    service.create(request(ticker = "SGBX"))
    service.create(request(ticker = "BNRG"))
    service.promoteDay(DAY)

    val second = service.promoteDay(DAY)

    assertEquals(emptyList<String>(), second.promoted)
    assertEquals(listOf("BNRG", "SGBX"), second.skipped)
    assertEquals(2, statRepo.count(), "the sheet did not grow")
  }

  @Test
  fun `promoteDay skips a day-ticker held by an unrelated stat and still promotes the rest`() {
    // Regression guard : the taken slot is checked before `create`, otherwise its 409 would mark
    // the transaction rollback-only and take the whole batch down with it.
    service.create(request(ticker = "SGBX"))
    service.create(request(ticker = "BNRG"))
    statService.create(statRequest(ticker = "SGBX"))

    val outcome = service.promoteDay(DAY)

    assertEquals(listOf("BNRG"), outcome.promoted)
    assertEquals(listOf("SGBX"), outcome.skipped)
    assertEquals(2, statRepo.count(), "the unrelated stat plus the one promotion")
  }

  @Test
  fun `promoteDay over a day without candidates promotes nothing`() {
    val outcome = service.promoteDay(DAY)

    assertEquals(emptyList<String>(), outcome.promoted)
    assertEquals(emptyList<String>(), outcome.skipped)
  }

  // ---------------------------------------------------------------------------
  // The « À l'open » card (#261)
  // ---------------------------------------------------------------------------

  @Test
  fun `the open is optional at capture and saved once typed at the open`() {
    val candidate = service.create(request(ticker = "KTTA"))
    assertNull(candidate.openPrice, "nothing is known of the session at capture time")

    service.update(candidate.id, request(ticker = "KTTA", openPrice = BigDecimal("4.20")))

    assertEquals(0, BigDecimal("4.20").compareTo(service.findById(candidate.id).openPrice))
  }

  @Test
  fun `a non-positive open is a 400`() {
    listOf(BigDecimal.ZERO, BigDecimal("-4.20")).forEach { open ->
      val ex =
        assertThrows(ResponseStatusException::class.java) {
          service.create(request(openPrice = open))
        }
      assertEquals(400, ex.statusCode.value())
    }
  }

  @Test
  fun `a target push typed for a candidate is saved, and clearing it follows the reference again`() {
    val candidate = service.create(request(ticker = "SGBX", openPrice = BigDecimal("1.90")))
    assertNull(candidate.targetPushPercent, "a new candidate follows the card's reference")

    // Tight float, expensive locate : this one is expected to run further than the average.
    val typed =
      service.update(
        candidate.id,
        request(
          ticker = "SGBX",
          openPrice = BigDecimal("1.90"),
          targetPushPercent = BigDecimal("15.0"),
        ),
      )
    assertEquals(0, BigDecimal("15.00").compareTo(typed.targetPushPercent))

    val cleared =
      service.update(candidate.id, request(ticker = "SGBX", openPrice = BigDecimal("1.90")))
    assertNull(cleared.targetPushPercent)
    assertEquals(0, BigDecimal("1.90").compareTo(cleared.openPrice), "the open is left alone")
  }

  @Test
  fun `a target push above 100 percent is saved, a small cap can push that far`() {
    val candidate = service.create(request(targetPushPercent = BigDecimal("250")))
    assertEquals(0, BigDecimal("250").compareTo(candidate.targetPushPercent))
  }

  @Test
  fun `a negative target push is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(targetPushPercent = BigDecimal("-5")))
      }
    assertEquals(400, ex.statusCode.value())
  }

  // Hit in the pilot test : a push typed after the pre-filled 15,3 read 15200 % and was saved.
  @Test
  fun `a target push above 1000 percent is a 400`() {
    val ex =
      assertThrows(ResponseStatusException::class.java) {
        service.create(request(targetPushPercent = BigDecimal("15200")))
      }
    assertEquals(400, ex.statusCode.value())
  }

  @Test
  fun `promoting a candidate carries its open over to the stat`() {
    val candidate = service.create(request(ticker = "KTTA", openPrice = BigDecimal("4.20")))

    val stat = service.promote(candidate.id)

    assertEquals(0, BigDecimal("4.20").compareTo(stat.openPrice))
    assertFalse(stat.completed, "the open alone does not complete the stat")
  }

  @Test
  fun `an open typed after an early promotion fills the stat that has none`() {
    // Promoted in premarket, before 9:30 : the stat starts without an open.
    val candidate = service.create(request(ticker = "KTTA"))
    val stat = service.promote(candidate.id)

    val updated =
      service.update(candidate.id, request(ticker = "KTTA", openPrice = BigDecimal("4.20")))

    assertTrue(updated.promoted, "an inline edit still reports the candidate as in stats")
    assertEquals(0, BigDecimal("4.20").compareTo(statService.findById(stat.id).openPrice))
  }

  @Test
  fun `an open typed on the candidate never overwrites the one already on the stat`() {
    val candidate = service.create(request(ticker = "KTTA"))
    val stat = service.promote(candidate.id)
    statRepo.save(statRepo.findById(stat.id).get().apply { openPrice = BigDecimal("4.18") })

    service.update(candidate.id, request(ticker = "KTTA", openPrice = BigDecimal("4.20")))

    assertEquals(
      0,
      BigDecimal("4.18").compareTo(statService.findById(stat.id).openPrice),
      "the open typed on the stat wins",
    )
  }

  @Test
  fun `deleting a candidate deletes its open, but the stat keeps its own copy`() {
    val candidate = service.create(request(ticker = "KTTA", openPrice = BigDecimal("4.20")))
    val stat = service.promote(candidate.id)

    service.delete(candidate.id)

    val kept = statService.findById(stat.id)
    assertNull(kept.candidateId, "the link to the deleted candidate is cleared")
    assertEquals(0, BigDecimal("4.20").compareTo(kept.openPrice))
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private fun makeUser(prefix: String) =
    User(
      email = "$prefix-${UUID.randomUUID()}@test.local",
      displayName = prefix,
      provider = "test",
      providerId = null,
      role = Role.USER,
    )

  private fun makeCandidate(owner: User, ticker: String) =
    Candidate(
      user = owner,
      tradingDate = DAY,
      ticker = ticker,
      previousClose = BigDecimal("2.65"),
      pmOpen = BigDecimal("4.05"),
      pmHigh = BigDecimal("4.65"),
    )

  /** KTTA on 09/17 — the example of `mockup/PARCOURS.md › Étape 1` (gap +52.8 %, push +14.8 %). */
  private fun request(
    ticker: String = "KTTA",
    tradingDate: LocalDate = DAY,
    pattern: Pattern = Pattern.GUS,
    previousClose: BigDecimal = BigDecimal("2.65"),
    pmOpen: BigDecimal = BigDecimal("4.05"),
    pmHigh: BigDecimal = BigDecimal("4.65"),
    floatMillions: BigDecimal? = null,
    volumeMillions: BigDecimal? = null,
    locatePerShare: BigDecimal? = null,
    note: String? = null,
    openPrice: BigDecimal? = null,
    targetPushPercent: BigDecimal? = null,
  ) =
    CandidateRequest(
      tradingDate = tradingDate,
      pattern = pattern,
      ticker = ticker,
      previousClose = previousClose,
      pmOpen = pmOpen,
      pmHigh = pmHigh,
      floatMillions = floatMillions,
      volumeMillions = volumeMillions,
      locatePerShare = locatePerShare,
      note = note,
      openPrice = openPrice,
      targetPushPercent = targetPushPercent,
    )

  /**
   * A stat entered straight on the sheet, with no source candidate — what an already-taken (day,
   * ticker) slot looks like when a promotion runs into it.
   */
  private fun statRequest(ticker: String = "KTTA", tradeDate: LocalDate = DAY) =
    StatEntryRequest(
      tradeDate = tradeDate,
      pattern = Pattern.GUS,
      ticker = ticker,
      previousClose = BigDecimal("2.65"),
      pmOpen = BigDecimal("4.05"),
      pmHigh = BigDecimal("4.65"),
    )

  private companion object {
    val DAY: LocalDate = LocalDate.of(2026, 9, 17)
  }
}
