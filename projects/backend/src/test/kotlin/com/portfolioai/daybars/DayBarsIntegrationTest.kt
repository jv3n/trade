package com.portfolioai.daybars

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.daybars.application.DayBarsService
import com.portfolioai.daybars.application.DayHaltsBackfill
import com.portfolioai.daybars.application.dto.DayChartState
import com.portfolioai.daybars.domain.Bar
import com.portfolioai.daybars.infrastructure.persistence.DayBarsRepository
import com.portfolioai.daybars.infrastructure.persistence.DayHaltRepository
import com.portfolioai.journal.infrastructure.persistence.TradeEntryRepository
import com.portfolioai.shared.Pattern
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.domain.StatEntry
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * Pins the storage of a day's 1-min bars behind a stat's chart (#784), on a real PostgreSQL.
 *
 * What is protected here :
 *
 * - bars are **market data, keyed by (day, ticker)** : a GUS and a DT of the same ticker-day read
 *   the same row, and so does another user's stat — they are stored once ;
 * - a stat reads one of **three states** : its bars, `PENDING` (nothing fetched yet — a stat of the
 *   day, before the scanner's next run) or `NOT_FOUND` (the provider served nothing) ;
 * - storing again **replaces** the day, and a not-found day can still get its bars later ;
 * - the bars come back in time order, one per minute, whatever order they were pushed in — of two
 *   readings of a minute the last pushed wins, a correction ; a bar off the minute grid is refused
 *   ;
 * - a stat of another user is a 404, as on the stats — the bars are read through a stat ;
 * - a day's **halts follow its bars** (#829) : read when they are stored, replaced with them,
 *   shared by the stats of the ticker-day, and worked out at startup for the days stored before.
 */
@SpringBootTest
class DayBarsIntegrationTest {

  @Autowired private lateinit var service: DayBarsService
  @Autowired private lateinit var barsRepo: DayBarsRepository
  @Autowired private lateinit var haltRepo: DayHaltRepository
  @Autowired private lateinit var backfill: DayHaltsBackfill
  @Autowired private lateinit var stats: StatEntryService
  @Autowired private lateinit var statRepo: StatEntryRepository
  @Autowired private lateinit var tradeRepo: TradeEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  @BeforeEach
  fun setUp() {
    tradeRepo.deleteAll()
    statRepo.deleteAll()
    barsRepo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)
  }

  @Test
  fun `a stat whose day was never fetched reads pending, with no bars`() {
    val stat = statRepo.save(stat(testUser, "OLOX"))

    val chart = service.chartOfStat(stat.id)

    assertEquals(DayChartState.PENDING, chart.state)
    assertEquals(OCT_21, chart.tradingDate)
    assertEquals("OLOX", chart.ticker)
    assertTrue(chart.bars.isEmpty())
  }

  @Test
  fun `a stat reads the bars of its ticker-day, in time order`() {
    val stat = statRepo.save(stat(testUser, "OLOX"))
    service.store(OCT_21, "OLOX", listOf(bar("13:31", "1.02"), bar("13:30", "1.10")))

    val chart = service.chartOfStat(stat.id)

    assertEquals(DayChartState.FOUND, chart.state)
    assertEquals(listOf("13:30", "13:31"), chart.bars.map { it.time.toString().substring(11, 16) })
    assertEquals(BigDecimal("1.10"), chart.bars.first().open)
  }

  @Test
  fun `the GUS and the DT of a ticker-day share one stored day`() {
    val gus = statRepo.save(stat(testUser, "SPHL"))
    val dt = statRepo.save(stat(testUser, "SPHL", Pattern.DT))
    service.store(OCT_21, "sphl ", listOf(bar("13:30", "2.40")))

    assertEquals(1, barsRepo.count())
    assertEquals(service.chartOfStat(gus.id).bars, service.chartOfStat(dt.id).bars)
  }

  @Test
  fun `another user's stat of the same ticker-day reads the same bars`() {
    service.store(OCT_21, "OLOX", listOf(bar("13:30", "1.10")))
    val theirs = statRepo.save(stat(otherUser, "OLOX"))
    whenever(authService.getCurrentUser()).thenReturn(otherUser)

    assertEquals(DayChartState.FOUND, service.chartOfStat(theirs.id).state)
  }

  @Test
  fun `a day the provider did not serve reads not found`() {
    val stat = statRepo.save(stat(testUser, "ZTG", day = LocalDate.of(2026, 10, 16)))
    service.markNotFound(LocalDate.of(2026, 10, 16), "ZTG")

    val chart = service.chartOfStat(stat.id)

    assertEquals(DayChartState.NOT_FOUND, chart.state)
    assertTrue(chart.bars.isEmpty())
  }

  @Test
  fun `storing a day again replaces its bars, a not-found day included`() {
    val stat = statRepo.save(stat(testUser, "OLOX"))
    service.markNotFound(OCT_21, "OLOX")
    service.store(OCT_21, "OLOX", listOf(bar("13:30", "1.10")))
    service.store(OCT_21, "OLOX", listOf(bar("13:30", "1.12"), bar("13:31", "1.05")))

    val chart = service.chartOfStat(stat.id)

    assertEquals(1, barsRepo.count())
    assertEquals(DayChartState.FOUND, chart.state)
    assertEquals(listOf(BigDecimal("1.12"), BigDecimal("1.05")), chart.bars.map { it.open })
  }

  @Test
  fun `of two readings of one minute, the last pushed wins`() {
    val stat = statRepo.save(stat(testUser, "OLOX"))
    service.store(
      OCT_21,
      "OLOX",
      listOf(bar("13:30", "1.10"), bar("13:31", "1.05"), bar("13:30", "1.12")),
    )

    val chart = service.chartOfStat(stat.id)

    assertEquals(listOf(BigDecimal("1.12"), BigDecimal("1.05")), chart.bars.map { it.open })
  }

  @Test
  fun `a bar off the minute grid is refused`() {
    val offGrid = bar("13:30", "1.10").copy(time = Instant.parse("2026-10-21T13:30:30Z"))

    val error =
      assertThrows(ResponseStatusException::class.java) {
        service.store(OCT_21, "OLOX", listOf(offGrid))
      }

    assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    assertEquals(0, barsRepo.count())
  }

  @Test
  fun `a day stored with no bar is refused — the provider's nothing is a not-found mark`() {
    val error =
      assertThrows(ResponseStatusException::class.java) {
        service.store(OCT_21, "OLOX", emptyList())
      }

    assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    assertEquals(0, barsRepo.count())
  }

  @Test
  fun `a stat of another user is a 404, its bars stored or not`() {
    service.store(OCT_21, "OLOX", listOf(bar("13:30", "1.10")))
    val theirs = statRepo.save(stat(otherUser, "OLOX"))

    val error = assertThrows(ResponseStatusException::class.java) { service.chartOfStat(theirs.id) }

    assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
  }

  @Test
  fun `storing a day reads its halts, and the chart lists them`() {
    val stat = statRepo.save(stat(testUser, "POM"))
    service.store(OCT_21, "POM", haltedDay())

    val halts = service.chartOfStat(stat.id).halts

    assertEquals(1, halts.size)
    assertEquals(Instant.parse("2026-10-21T13:41:00Z"), halts.single().haltedAt)
    assertEquals(Instant.parse("2026-10-21T13:51:00Z"), halts.single().reopenedAt)
    assertEquals(0, BigDecimal("0.94").compareTo(halts.single().lastClose))
    assertEquals(0, BigDecimal("1.35").compareTo(halts.single().reopenPrice))
  }

  @Test
  fun `the GUS and the DT of a ticker-day both count its halts`() {
    val gus = statRepo.save(stat(testUser, "POM"))
    val dt = statRepo.save(stat(testUser, "POM", Pattern.DT))
    service.store(OCT_21, "POM", haltedDay())

    assertEquals(1, stats.findById(gus.id).haltCount)
    assertEquals(1, stats.findById(dt.id).haltCount)
  }

  @Test
  fun `a stat typed by hand on a day without a halt counts none`() {
    val stat = statRepo.save(stat(testUser, "OLOX"))
    service.store(OCT_21, "OLOX", listOf(bar("13:30", "1.10")))

    assertEquals(0, stats.findById(stat.id).haltCount)
  }

  @Test
  fun `storing a day again replaces its halts, the same halt included`() {
    service.store(OCT_21, "POM", haltedDay())
    service.store(OCT_21, "POM", haltedDay())
    assertEquals(1, haltRepo.count())

    service.store(OCT_21, "POM", listOf(bar("13:30", "1.10")))
    assertEquals(0, haltRepo.count())
  }

  @Test
  fun `a day marked not found keeps no halt`() {
    service.store(OCT_21, "POM", haltedDay())

    service.markNotFound(OCT_21, "POM")

    assertEquals(0, haltRepo.count())
  }

  @Test
  fun `the backfill reads a day stored before the halts, once`() {
    service.store(OCT_21, "POM", haltedDay())
    haltRepo.deleteAll()
    barsRepo.saveAndFlush(barsRepo.findAll().single().apply { haltsRead = false })

    backfill.run()

    assertEquals(1, haltRepo.count())
    assertTrue(service.daysWithHaltsUnread().isEmpty())
  }

  /** A busy morning halted from 09:41 to 09:51, New York — POM's second halt of 21/10. */
  private fun haltedDay(): List<Bar> {
    val day = (30..41).map { "13:$it" } + (51..59).map { "13:$it" }
    return day.map { minute ->
      val price = BigDecimal(if (minute == "13:41") "0.94" else "1.35")
      Bar(Instant.parse("2026-10-21T$minute:00Z"), price, price, price, price, 300_000)
    }
  }

  /** A GUS carries its premarket (the database requires it), a DT none (#649). */
  private fun stat(
    user: User,
    ticker: String,
    pattern: Pattern = Pattern.GUS,
    day: LocalDate = OCT_21,
  ) =
    StatEntry(user = user, tradeDate = day, ticker = ticker, pattern = pattern).apply {
      if (pattern == Pattern.GUS) {
        previousClose = BigDecimal("0.6200")
        pmOpen = BigDecimal("0.9000")
        pmHigh = BigDecimal("1.2400")
      }
    }

  /** A bar of 21/10 at [utc] (HH:mm, UTC — 13:30 is the New York open), flat at [price]. */
  private fun bar(utc: String, price: String) =
    BigDecimal(price).let { Bar(Instant.parse("2026-10-21T$utc:00Z"), it, it, it, it, 10_000) }

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

  private companion object {
    val OCT_21: LocalDate = LocalDate.of(2026, 10, 21)
  }
}
