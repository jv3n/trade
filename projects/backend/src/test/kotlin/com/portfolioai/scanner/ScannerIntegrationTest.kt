package com.portfolioai.scanner

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.auth.infrastructure.security.AppOAuth2User
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.scanner.domain.ScannerRun
import com.portfolioai.scanner.infrastructure.persistence.ScannerRunRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatReview
import com.portfolioai.stats.domain.StatSource
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
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import tools.jackson.databind.ObjectMapper

/**
 * Pins ts-scanner's way into `trade` (#763), through the real filter chains on a real PostgreSQL.
 *
 * - **The token opens the scanner's POSTs and nothing else** : none or a wrong one is a 401, and
 *   the right one on any other path is a 401 too — the session chain never reads it.
 * - **The scanner never creates a stat that exists** : the same batch pushed twice creates nothing
 *   the second time, a rejected stat never comes back, a GUS typed or promoted by hand the same day
 *   is never duplicated — each skip reported with its reason.
 * - A stat its own rules refuse is skipped without losing the rest of the batch.
 * - Each run is recorded, and the owner's session reads the latest one for the Today page — a
 *   partial run with the tickers it missed (#779), apart from a failed one's error.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["scanner.api-token=$TOKEN", "scanner.owner-user-id=$OWNER_ID"])
class ScannerIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var json: ObjectMapper
  @Autowired private lateinit var users: UserRepository
  @Autowired private lateinit var stats: StatEntryRepository
  @Autowired private lateinit var trades: TradeEntryRepository
  @Autowired private lateinit var runs: ScannerRunRepository

  private lateinit var owner: User

  @BeforeEach
  fun setUp() {
    trades.deleteAll()
    stats.deleteAll()
    runs.deleteAll()
    users.deleteAll()
    owner =
      users.save(
        User(
          id = UUID.fromString(OWNER_ID),
          email = "trader-${UUID.randomUUID()}@test.local",
          provider = "test",
          role = Role.USER,
        )
      )
  }

  // ---------------------------------------------------------------------------
  // The door
  // ---------------------------------------------------------------------------

  @Test
  fun `a push without the token is a 401`() {
    mvc
      .perform(
        post("/api/scanner/stats").contentType(MediaType.APPLICATION_JSON).content(batch(nxtp()))
      )
      .andExpect(status().isUnauthorized)
  }

  @Test
  fun `a push with a wrong token is a 401`() {
    pushStats(batch(nxtp()), token = "not-the-token").andExpect(status().isUnauthorized)
  }

  @Test
  fun `the token opens nothing but the scanner's POSTs`() {
    mvc.perform(get("/api/stats").withToken()).andExpect(status().isUnauthorized)
    mvc.perform(get("/api/scanner/runs/latest").withToken()).andExpect(status().isUnauthorized)
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  @Test
  fun `a push creates the GUS and the double top to review, for the owner, with no candidate`() {
    pushStats(batch(nxtp(), bnrg()))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.created.length()").value(2))
      .andExpect(jsonPath("$.skipped.length()").value(0))

    val recorded = stats.findAll().associateBy { it.ticker }
    assertEquals(setOf("NXTP", "BNRG"), recorded.keys)
    recorded.values.forEach {
      assertEquals(owner.id, it.user.id)
      assertEquals(StatSource.SCANNER, it.source)
      assertEquals(StatReview.TO_REVIEW, it.review)
      assertNull(it.candidateId)
    }
    assertEquals(Pattern.DT, recorded.getValue("BNRG").pattern)
    assertEquals(BigDecimal("3.3000"), recorded.getValue("BNRG").dtTopPrice)
  }

  @Test
  fun `pushing the same batch twice creates nothing the second time`() {
    pushStats(batch(nxtp(), bnrg()))

    pushStats(batch(nxtp(), bnrg()))
      .andExpect(jsonPath("$.created.length()").value(0))
      .andExpect(jsonPath("$.skipped[0].reason").value("ALREADY_SCANNED"))
      .andExpect(jsonPath("$.skipped[1].reason").value("ALREADY_SCANNED"))
    assertEquals(2, stats.count())
  }

  @Test
  fun `a rejected stat is never recreated`() {
    pushStats(batch(bnrg()))
    stats.findAll().single().let {
      it.review = StatReview.REJECTED
      stats.save(it)
    }

    pushStats(batch(bnrg())).andExpect(jsonPath("$.skipped[0].reason").value("REJECTED"))

    assertEquals(StatReview.REJECTED, stats.findAll().single().review)
  }

  @Test
  fun `a GUS promoted by hand the same day is never duplicated — the candidate's stat wins`() {
    stats.save(
      StatEntry(
        user = owner,
        tradeDate = DAY,
        ticker = "NXTP",
        previousClose = BigDecimal("2.6500"),
        pmOpen = BigDecimal("4.0500"),
        pmHigh = BigDecimal("4.6500"),
      )
    )

    pushStats(batch(nxtp())).andExpect(jsonPath("$.skipped[0].reason").value("TYPED_BY_HAND"))

    assertEquals(StatSource.MANUAL, stats.findAll().single().source)
  }

  @Test
  fun `a ticker twice in one batch is created once`() {
    pushStats(batch(nxtp(), nxtp()))
      .andExpect(jsonPath("$.created.length()").value(1))
      .andExpect(jsonPath("$.skipped[0].reason").value("DUPLICATE_IN_BATCH"))
  }

  @Test
  fun `a stat its rules refuse is skipped with why, the rest of the batch is created`() {
    // A GUS with no previous close : the detector misread the premarket.
    val misread = nxtp() - "previousClose"

    pushStats(batch(misread, bnrg()))
      .andExpect(jsonPath("$.created[0].ticker").value("BNRG"))
      .andExpect(jsonPath("$.skipped[0].reason").value("INVALID"))
      .andExpect(jsonPath("$.skipped[0].detail").value("Previous close is required"))
  }

  @Test
  fun `a scan dated in the future is a 400`() {
    pushStats(
        json.writeValueAsString(
          mapOf("tradingDate" to LocalDate.now().plusDays(2), "stats" to emptyList<Any>())
        )
      )
      .andExpect(status().isBadRequest)
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  @Test
  fun `the owner's session reads the latest run, none before the first`() {
    mvc
      .perform(get("/api/scanner/runs/latest").with(ownerSession()))
      .andExpect(status().isNoContent)
    pushRun(run("2026-10-22T11:00:00Z", error = null)).andExpect(status().isCreated)
    pushRun(run("2026-10-23T11:00:00Z", error = "Massive answered 429"))
      .andExpect(status().isCreated)

    mvc
      .perform(get("/api/scanner/runs/latest").with(ownerSession()))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.startedAt").value("2026-10-23T11:00:00Z"))
      .andExpect(jsonPath("$.tickersScanned").value(412))
      .andExpect(jsonPath("$.error").value("Massive answered 429"))
  }

  @Test
  fun `the database refuses a run that finishes before it starts`() {
    assertThrows(DataIntegrityViolationException::class.java) {
      runs.saveAndFlush(
        ScannerRun(
          user = owner,
          tradingDate = DAY,
          startedAt = Instant.parse("2026-10-23T11:00:00Z"),
          finishedAt = Instant.parse("2026-10-23T10:59:00Z"),
          tickersScanned = 412,
          gusFound = 2,
          dtFound = 2,
        )
      )
    }
  }

  @Test
  fun `a partial run keeps the tickers it missed, each once and upper-cased, and no error`() {
    pushRun(
        run("2026-10-23T11:00:00Z", error = null, missedTickers = listOf(" sgrx", "AIXI", "SGRX"))
      )
      .andExpect(status().isCreated)

    mvc
      .perform(get("/api/scanner/runs/latest").with(ownerSession()))
      .andExpect(jsonPath("$.missedTickers.length()").value(2))
      .andExpect(jsonPath("$.missedTickers[0]").value("SGRX"))
      .andExpect(jsonPath("$.missedTickers[1]").value("AIXI"))
      .andExpect(jsonPath("$.error").doesNotExist())
  }

  @Test
  fun `an entry carrying its reason keeps its ticker alone — a comma in the reason is no second ticker`() {
    val withReason = "SGRX (Connect timeout has expired [url=…, connect_timeout=10000 ms])"
    pushRun(
        run(
          "2026-10-23T11:00:00Z",
          error = null,
          missedTickers = listOf(withReason, "connect_timeout=10000 ms]"),
        )
      )
      .andExpect(status().isCreated)

    mvc
      .perform(get("/api/scanner/runs/latest").with(ownerSession()))
      .andExpect(jsonPath("$.missedTickers.length()").value(1))
      .andExpect(jsonPath("$.missedTickers[0]").value("SGRX"))
  }

  @Test
  fun `a run that missed nothing reads an empty list`() {
    pushRun(run("2026-10-23T11:00:00Z", error = null)).andExpect(status().isCreated)

    mvc
      .perform(get("/api/scanner/runs/latest").with(ownerSession()))
      .andExpect(jsonPath("$.missedTickers.length()").value(0))
  }

  @Test
  fun `a run with a negative count is a 400`() {
    pushRun(run("2026-10-23T11:00:00Z", error = null, gusFound = -1))
      .andExpect(status().isBadRequest)
  }

  // ---------------------------------------------------------------------------

  private fun pushStats(body: String, token: String = TOKEN): ResultActions =
    mvc.perform(
      post("/api/scanner/stats")
        .header(HttpHeaders.AUTHORIZATION, "Bearer $token")
        .contentType(MediaType.APPLICATION_JSON)
        .content(body)
    )

  private fun pushRun(body: String): ResultActions =
    mvc.perform(
      post("/api/scanner/runs").withToken().contentType(MediaType.APPLICATION_JSON).content(body)
    )

  private fun org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
    .withToken() = header(HttpHeaders.AUTHORIZATION, "Bearer $TOKEN")

  private fun ownerSession() =
    listOf(SimpleGrantedAuthority("ROLE_USER")).let { authorities ->
      authentication(
        OAuth2AuthenticationToken(
          AppOAuth2User(owner.id, owner.email, mapOf("sub" to "g-1"), authorities),
          authorities,
          "google",
        )
      )
    }

  private fun batch(vararg stats: Map<String, Any>) =
    json.writeValueAsString(mapOf("tradingDate" to DAY, "stats" to stats.toList()))

  /** NXTP of the mockup — a GUS with its premarket and its OPS session. */
  private fun nxtp(): Map<String, Any> =
    mapOf(
      "pattern" to "GUS",
      "ticker" to "nxtp",
      "volumeMillions" to 18.4,
      "previousClose" to 2.65,
      "pmOpen" to 4.05,
      "pmHigh" to 4.65,
      "openPrice" to 4.20,
      "pushOpenPrice" to 4.62,
      "pushOpenTime" to "09:41",
      "hodPrice" to 4.62,
      "lodPrice" to 3.41,
      "eodPrice" to 3.52,
      "gusDropPrice" to 3.41,
      "gusDropTime" to "10:25",
    )

  /** BNRG of the mockup — a double top's five BARES points. */
  private fun bnrg(): Map<String, Any> =
    mapOf(
      "pattern" to "DT",
      "ticker" to "BNRG",
      "dtStartPrice" to 2.10,
      "dtStartTime" to "10:05",
      "dtTopPrice" to 3.30,
      "dtTopTime" to "10:16",
      "dtLowPrice" to 2.68,
      "dtLowTime" to "10:24",
      "dtRetestPrice" to 3.21,
      "dtRetestTime" to "10:41",
      "dtDropPrice" to 2.72,
      "dtDropTime" to "11:12",
    )

  private fun run(
    startedAt: String,
    error: String?,
    gusFound: Int = 2,
    missedTickers: List<String> = emptyList(),
  ) =
    json.writeValueAsString(
      mapOf(
        "tradingDate" to DAY,
        "startedAt" to startedAt,
        "finishedAt" to startedAt.replace("11:00", "11:20"),
        "tickersScanned" to 412,
        "gusFound" to gusFound,
        "dtFound" to 2,
        "error" to error,
        "missedTickers" to missedTickers,
      )
    )
}

/**
 * The shipped default (#763) : `scanner.api-token` left empty, as `application.yml` and
 * `.env.example` have it — a Secret Manager entry never set. The door stays shut, even to an empty
 * bearer, which `MessageDigest.isEqual` alone would let through : two empty arrays are equal.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["scanner.api-token=", "scanner.owner-user-id=$OWNER_ID"])
class ScannerTokenUnsetIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc

  @Test
  fun `without a token configured, an empty bearer is a 401`() {
    push("Bearer ").andExpect(status().isUnauthorized)
  }

  @Test
  fun `without a token configured, any bearer is a 401`() {
    push("Bearer $TOKEN").andExpect(status().isUnauthorized)
  }

  private fun push(authorization: String): ResultActions =
    mvc.perform(
      post("/api/scanner/runs")
        .header(HttpHeaders.AUTHORIZATION, authorization)
        .contentType(MediaType.APPLICATION_JSON)
        .content("{}")
    )
}

private const val TOKEN = "test-scanner-token"
private const val OWNER_ID = "6f1c2a7e-3b9d-4c51-9e0a-2d7b8f4c1a63"
private val DAY: LocalDate = LocalDate.of(2026, 10, 22)
