package com.portfolioai.scanner

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.daybars.application.DayBarsService
import com.portfolioai.daybars.application.dto.DayChartState
import com.portfolioai.daybars.domain.Bar
import com.portfolioai.daybars.infrastructure.persistence.DayBarsRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.domain.StatReview
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import tools.jackson.databind.ObjectMapper

/**
 * Pins how ts-scanner feeds the stats' charts (#798), through the real filter chains on a real
 * PostgreSQL — `trade` calls no provider, the scanner pushes the bars.
 *
 * - **A scanner stat arrives with its bars** : the batch carries the day's 1-min bars of its
 *   tickers, stored for the ticker-day. A batch is refused whole — no stat kept — when it carries
 *   bars of a ticker it has no stat for, or a bar of another day.
 * - **Every other stat is fetched afterwards** : the scanner lists the owner's ticker-days still
 *   without bars — newest first, each ticker-day once whatever its patterns, a rejected stat and a
 *   day not over yet left out — then pushes each one's bars, or marks it not found, after which it
 *   is never listed again.
 * - That list takes the scanner's token like its POSTs ; a ticker-day pushed for no stat of the
 *   owner is a 400.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["scanner.api-token=$TOKEN", "scanner.owner-user-id=$OWNER_ID"])
class ScannerBarsIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var json: ObjectMapper
  @Autowired private lateinit var users: UserRepository
  @Autowired private lateinit var stats: StatEntryRepository
  @Autowired private lateinit var trades: TradeEntryRepository
  @Autowired private lateinit var bars: DayBarsRepository
  @Autowired private lateinit var dayBars: DayBarsService

  private lateinit var owner: User

  @BeforeEach
  fun setUp() {
    trades.deleteAll()
    stats.deleteAll()
    bars.deleteAll()
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
  // Bars pushed with the stats
  // ---------------------------------------------------------------------------

  @Test
  fun `a scanner stat arrives with the bars of its day`() {
    pushStats(batch(listOf(bnrg()), mapOf("BNRG" to listOf(bar("14:16", "3.30")))))
      .andExpect(status().isOk)

    val chart = dayBars.chartOf(DAY, "BNRG")
    assertEquals(DayChartState.FOUND, chart.state)
    assertEquals(BigDecimal("3.30"), chart.bars.single().high)
  }

  @Test
  fun `bars of a ticker the batch has no stat for refuse the whole batch`() {
    pushStats(batch(listOf(bnrg()), mapOf("SPHL" to listOf(bar("14:16", "2.40")))))
      .andExpect(status().isBadRequest)

    assertEquals(0, stats.count())
    assertEquals(0, bars.count())
  }

  @Test
  fun `a bar of another day refuses the whole batch`() {
    val nextDay = bar("14:16", "3.30").plus("time" to "2026-10-23T14:16:00Z")
    pushStats(batch(listOf(bnrg()), mapOf("BNRG" to listOf(nextDay))))
      .andExpect(status().isBadRequest)

    assertEquals(0, stats.count())
  }

  // ---------------------------------------------------------------------------
  // The missing bars
  // ---------------------------------------------------------------------------

  @Test
  fun `the missing list needs the scanner's token`() {
    mvc.perform(get("/api/scanner/bars/missing")).andExpect(status().isUnauthorized)
  }

  @Test
  fun `the missing list gives each ticker-day once, newest first`() {
    stats.save(typed("OLOX", DAY.minusDays(1)))
    stats.save(typed("SPHL", DAY))
    stats.save(typed("SPHL", DAY, Pattern.DT))

    missing()
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(2))
      .andExpect(jsonPath("$[0].ticker").value("SPHL"))
      .andExpect(jsonPath("$[0].tradingDate").value(DAY.toString()))
      .andExpect(jsonPath("$[1].ticker").value("OLOX"))
  }

  @Test
  fun `a ticker-day with bars, marked not found, rejected or not over yet is not missing`() {
    stats.save(typed("OLOX", DAY))
    dayBars.markNotFound(DAY, "OLOX")
    stats.save(typed("ZTG", DAY))
    dayBars.store(DAY, "ZTG", listOf(dayBar()))
    stats.save(typed("ATXG", DAY, rejected = true))
    // Asked before the day is over, the provider would serve nothing and it would be marked for
    // good.
    stats.save(typed("NOW", LocalDate.now(ZoneId.of("America/New_York"))))
    stats.save(typed("SPHL", DAY))

    missing()
      .andExpect(jsonPath("$.length()").value(1))
      .andExpect(jsonPath("$[0].ticker").value("SPHL"))
  }

  @Test
  fun `the missing list stops at the limit asked`() {
    (1..3).forEach { stats.save(typed("OLOX", DAY.minusDays(it.toLong()))) }

    missing(limit = 2).andExpect(jsonPath("$.length()").value(2))
  }

  @Test
  fun `bars pushed for a missing ticker-day give its stat a chart, and it leaves the list`() {
    stats.save(typed("OLOX", DAY))

    send(
        "/api/scanner/bars",
        mapOf("tradingDate" to DAY, "ticker" to "OLOX", "bars" to listOf(bar("13:30", "1.10"))),
      )
      .andExpect(status().isNoContent)

    assertEquals(DayChartState.FOUND, dayBars.chartOf(DAY, "OLOX").state)
    missing().andExpect(jsonPath("$.length()").value(0))
  }

  @Test
  fun `a ticker-day marked not found leaves the list`() {
    stats.save(typed("ZTG", DAY))

    send("/api/scanner/bars/not-found", mapOf("tradingDate" to DAY, "ticker" to "ZTG"))
      .andExpect(status().isNoContent)

    assertEquals(DayChartState.NOT_FOUND, dayBars.chartOf(DAY, "ZTG").state)
    missing().andExpect(jsonPath("$.length()").value(0))
  }

  @Test
  fun `bars pushed for no stat of the owner are a 400`() {
    send(
        "/api/scanner/bars",
        mapOf("tradingDate" to DAY, "ticker" to "OLOX", "bars" to listOf(bar("13:30", "1.10"))),
      )
      .andExpect(status().isBadRequest)
    send("/api/scanner/bars/not-found", mapOf("tradingDate" to DAY, "ticker" to "OLOX"))
      .andExpect(status().isBadRequest)

    assertEquals(0, bars.count())
  }

  // ---------------------------------------------------------------------------

  private fun pushStats(body: String): ResultActions =
    mvc.perform(
      post("/api/scanner/stats").withToken().contentType(MediaType.APPLICATION_JSON).content(body)
    )

  private fun send(path: String, body: Map<String, Any>): ResultActions =
    mvc.perform(
      post(path)
        .withToken()
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(body))
    )

  private fun missing(limit: Int? = null): ResultActions =
    mvc.perform(
      get("/api/scanner/bars/missing").withToken().apply { limit?.let { param("limit", "$it") } }
    )

  private fun MockHttpServletRequestBuilder.withToken() =
    header(HttpHeaders.AUTHORIZATION, "Bearer $TOKEN")

  private fun batch(stats: List<Map<String, Any>>, bars: Map<String, List<Map<String, Any>>>) =
    json.writeValueAsString(
      mapOf(
        "tradingDate" to DAY,
        "stats" to stats,
        "bars" to bars.map { (ticker, day) -> mapOf("ticker" to ticker, "bars" to day) },
      )
    )

  /** A bar of 22/10 at [utc] (HH:mm, UTC — 13:30 is the New York open), flat at [price]. */
  private fun bar(utc: String, price: String): Map<String, Any> =
    mapOf(
      "time" to "2026-10-22T$utc:00Z",
      "open" to price,
      "high" to price,
      "low" to price,
      "close" to price,
      "volume" to 12_000,
    )

  private fun dayBar() =
    BigDecimal("1.00").let { Bar(Instant.parse("2026-10-22T13:30:00Z"), it, it, it, it, 1) }

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

  /** A stat typed by hand — a GUS with its premarket, or a bare DT ; [rejected], a scanner one. */
  private fun typed(
    ticker: String,
    day: LocalDate,
    pattern: Pattern = Pattern.GUS,
    rejected: Boolean = false,
  ) =
    StatEntry(
        user = owner,
        tradeDate = day,
        ticker = ticker,
        pattern = pattern,
        source = if (rejected) StatSource.SCANNER else StatSource.MANUAL,
        review = StatReview.REJECTED.takeIf { rejected },
      )
      .apply {
        if (pattern == Pattern.GUS) {
          previousClose = BigDecimal("0.6200")
          pmOpen = BigDecimal("0.9000")
          pmHigh = BigDecimal("1.2400")
        }
      }
}

private const val TOKEN = "test-scanner-bars-token"
private const val OWNER_ID = "0b6e3c1d-7a2f-4e8b-9c5d-1f3a6b8e2d47"
private val DAY: LocalDate = LocalDate.of(2026, 10, 22)
