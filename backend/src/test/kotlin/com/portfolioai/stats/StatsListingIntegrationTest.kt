package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.stats.application.StatEntryCsvDecoder
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatEntryFormRequest
import com.portfolioai.stats.domain.StatEntryFilter
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException

/**
 * Integration test on the stats listing + CRUD paths (JPA → Postgres via Testcontainers). Pins the
 * per-user model V2/V3 introduced :
 *
 * - **Listing** — default ordering (`tradeDate desc, createdAt desc`), URL sort honoured,
 *   pagination slices + totals, and the filters (ticker / date / source / gap) via the
 *   Specification.
 * - **Visibility** — a user sees the global IMPORT rows + their own ; never another user's.
 * - **Per-owner uniqueness + upsert** — creating twice for the same (day, ticker) overwrites the
 *   caller's row ; a user's own row and the community IMPORT row for the same day/ticker
 *   **coexist**.
 * - **Ownership** — edit / delete touch only the caller's rows ; IMPORT rows return 404.
 *
 * `AuthService` is `@MockitoBean` (the real one reads an empty `SecurityContext` outside a
 * request), set per test to a seeded user — same pattern as `JournalIntegrationTest`.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class StatsListingIntegrationTest {

  @Autowired private lateinit var service: StatEntryService
  @Autowired private lateinit var repo: StatEntryRepository
  @Autowired private lateinit var userRepository: UserRepository

  @MockitoBean private lateinit var authService: AuthService

  private lateinit var testUser: User
  private lateinit var otherUser: User

  private val header = StatEntryCsvDecoder.HEADERS.joinToString(",")
  private val noFilter = StatEntryFilter()

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)

    // Three GLOBAL community rows via the ADMIN CSV import (createdBy = null → visible to
    // everyone).
    //   ALDX 2026-06-04 open 4.20 high 4.45 -> push +5.95
    //   GBOX 2026-06-02 open 3.50 high 3.80 -> push +8.57
    //   CEI  2026-05-12 open 1.85 high 2.00 -> push +8.11
    val csv =
      header +
        "\n2026-06-04,ALDX,52.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000" +
        "\n2026-06-02,GBOX,61.0,8.7,22.4,true,false,false,false,,3.5000,3.8000,3.2000,3.4000" +
        "\n2026-05-12,CEI,77.0,38.5,2.8,false,true,true,false,,1.8500,2.0000,1.5000,1.5500"
    service.importCsv(csv)
  }

  // ---- Listing ------------------------------------------------------------------------------

  @Test
  fun `defaults to newest-first when the page request carries no sort`() {
    val page = service.findAllPaged(noFilter, PageRequest.of(0, 50))

    assertEquals(3, page.totalElements)
    assertEquals(listOf("ALDX", "GBOX", "CEI"), page.content.map { it.ticker })
  }

  @Test
  fun `honours a user-supplied sort over the default`() {
    val page =
      service.findAllPaged(noFilter, PageRequest.of(0, 50, Sort.by(Sort.Order.asc("pushPercent"))))

    // +5.95 (ALDX) < +8.11 (CEI) < +8.57 (GBOX)
    assertEquals(listOf("ALDX", "CEI", "GBOX"), page.content.map { it.ticker })
  }

  @Test
  fun `paginates — page size bounds the slice while totalElements counts the whole dataset`() {
    val firstPage = service.findAllPaged(noFilter, PageRequest.of(0, 2))

    assertEquals(3, firstPage.totalElements)
    assertEquals(2, firstPage.totalPages)
    assertEquals(listOf("ALDX", "GBOX"), firstPage.content.map { it.ticker })

    val secondPage = service.findAllPaged(noFilter, PageRequest.of(1, 2))
    assertEquals(listOf("CEI"), secondPage.content.map { it.ticker })
  }

  // ---- Filters ------------------------------------------------------------------------------

  @Test
  fun `filters by ticker case-insensitively`() {
    val page = service.findAllPaged(StatEntryFilter(query = "ald"), PageRequest.of(0, 50))
    assertEquals(listOf("ALDX"), page.content.map { it.ticker })
  }

  @Test
  fun `filters by inclusive date range`() {
    val page =
      service.findAllPaged(
        StatEntryFilter(dateFrom = LocalDate.of(2026, 6, 1), dateTo = LocalDate.of(2026, 6, 30)),
        PageRequest.of(0, 50),
      )
    assertEquals(listOf("ALDX", "GBOX"), page.content.map { it.ticker })
  }

  @Test
  fun `filters by source`() {
    service.create(radarForm("MINE", gap = "80.0"))
    val imported =
      service.findAllPaged(StatEntryFilter(source = StatSource.IMPORT), PageRequest.of(0, 50))
    val radar =
      service.findAllPaged(StatEntryFilter(source = StatSource.RADAR), PageRequest.of(0, 50))

    assertEquals(3, imported.totalElements)
    assertEquals(listOf("MINE"), radar.content.map { it.ticker })
  }

  @Test
  fun `filters by gap range`() {
    // ALDX 52, GBOX 61, CEI 77 — keep [60, 70] → only GBOX.
    val page =
      service.findAllPaged(
        StatEntryFilter(gapMin = BigDecimal("60"), gapMax = BigDecimal("70")),
        PageRequest.of(0, 50),
      )
    assertEquals(listOf("GBOX"), page.content.map { it.ticker })
  }

  // ---- Create / upsert / visibility ---------------------------------------------------------

  @Test
  fun `create seeds a partial RADAR row owned by the caller`() {
    val dto = service.create(radarForm("gels", gap = "72.0", open = "3.5000"))

    assertEquals("GELS", dto.ticker, "ticker normalised")
    assertEquals(StatSource.RADAR, dto.source)
    assertEquals(testUser.id, dto.createdBy)
    assertNull(dto.highPrice)
    assertNull(dto.pushPercent)
  }

  @Test
  fun `create defaults the trade date to today when omitted`() {
    val dto = service.create(radarForm("GELS", gap = "72.0", open = "3.5000"))
    assertEquals(LocalDate.now(ZoneId.of("America/New_York")), dto.tradeDate)
  }

  @Test
  fun `create twice for the same day-ticker upserts the caller's row`() {
    val date = LocalDate.of(2026, 6, 11)
    service.create(radarForm("GELS", gap = "72.0", open = "3.50", tradeDate = date))
    val second = service.create(radarForm("GELS", gap = "80.0", open = "3.90", tradeDate = date))

    val mine = service.findAllPaged(StatEntryFilter(query = "gels"), PageRequest.of(0, 50)).content
    assertEquals(1, mine.size, "upsert — one row, not two")
    assertEquals(
      0,
      second.gapUpPercent!!.compareTo(BigDecimal("80.0")),
      "row carries the latest gap",
    )
  }

  @Test
  fun `a user's own row and the community IMPORT row for the same day-ticker coexist`() {
    // ALDX 2026-06-04 already exists as an IMPORT row (createdBy null). The user adds their own.
    service.create(
      radarForm("ALDX", gap = "55.0", open = "4.30", tradeDate = LocalDate.of(2026, 6, 4))
    )

    val aldx = service.findAllPaged(StatEntryFilter(query = "aldx"), PageRequest.of(0, 50)).content
    assertEquals(2, aldx.size, "community IMPORT + own RADAR coexist for the same day/ticker")
    assertEquals(setOf(StatSource.IMPORT, StatSource.RADAR), aldx.map { it.source }.toSet())
  }

  @Test
  fun `a user never sees another user's row — only global rows leak across users`() {
    service.create(radarForm("SECRET", gap = "90.0", open = "1.50"))

    whenever(authService.getCurrentUser()).thenReturn(otherUser)
    val visible = service.findAllPaged(noFilter, PageRequest.of(0, 50)).content.map { it.ticker }

    assertTrue(visible.containsAll(listOf("ALDX", "GBOX", "CEI")), "global rows visible to all")
    assertTrue(!visible.contains("SECRET"), "another user's row must not leak")
  }

  // ---- Ownership : edit / delete ------------------------------------------------------------

  @Test
  fun `update edits the caller's own row`() {
    val created = service.create(radarForm("GELS", gap = "72.0", open = "3.50"))
    val edited =
      service.update(created.id, manualForm("GELS", gap = "99.0", open = "3.50", high = "4.00"))

    assertEquals(0, edited.gapUpPercent!!.compareTo(BigDecimal("99.0")))
    assertEquals(StatSource.RADAR, edited.source, "update keeps the row's original origin")
    assertEquals(
      0,
      edited.pushPercent!!.compareTo(BigDecimal("14.29")),
      "push recomputed from high",
    )
  }

  @Test
  fun `update on an IMPORT row returns 404 — community rows are not user-editable`() {
    val importRow = repo.findAll().first { it.createdBy == null }
    val ex =
      assertThrows<ResponseStatusException> {
        service.update(importRow.id, manualForm("ALDX", gap = "1.0", open = "1.0"))
      }
    assertEquals(404, ex.statusCode.value())
  }

  @Test
  fun `delete removes the caller's own row`() {
    val created = service.create(radarForm("GELS", gap = "72.0", open = "3.50"))
    service.delete(created.id)
    assertNull(repo.findById(created.id).orElse(null), "row gone")
  }

  @Test
  fun `delete on an IMPORT row returns 404 — community rows are not user-deletable`() {
    val importRow = repo.findAll().first { it.createdBy == null }
    val ex = assertThrows<ResponseStatusException> { service.delete(importRow.id) }
    assertEquals(404, ex.statusCode.value())
    assertTrue(repo.findById(importRow.id).isPresent, "the IMPORT row is still there")
  }

  @Test
  fun `import re-run upserts the community row rather than duplicating`() {
    // Re-import ALDX with a different gap — same (day, ticker, null) → updated, not duplicated.
    val csv =
      header +
        "\n2026-06-04,ALDX,99.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000"
    service.importCsv(csv)

    val aldx = service.findAllPaged(StatEntryFilter(query = "aldx"), PageRequest.of(0, 50)).content
    assertEquals(1, aldx.size, "re-import upserts, no duplicate community row")
    assertEquals(0, aldx.first().gapUpPercent!!.compareTo(BigDecimal("99.0")))
  }

  // ---- Helpers ------------------------------------------------------------------------------

  private fun radarForm(
    ticker: String,
    gap: String,
    open: String = "3.0000",
    tradeDate: LocalDate? = null,
  ) =
    StatEntryFormRequest(
      ticker = ticker,
      gapUpPercent = BigDecimal(gap),
      openPrice = BigDecimal(open),
      tradeDate = tradeDate,
      source = StatSource.RADAR,
    )

  private fun manualForm(ticker: String, gap: String, open: String, high: String? = null) =
    StatEntryFormRequest(
      ticker = ticker,
      gapUpPercent = BigDecimal(gap),
      openPrice = BigDecimal(open),
      source = StatSource.MANUAL,
      highPrice = high?.let { BigDecimal(it) },
    )

  private fun saveUser(name: String): User =
    userRepository.save(
      User(
        email = "$name-${UUID.randomUUID()}@test.local",
        displayName = name,
        provider = "test",
        providerId = null,
        role = Role.USER,
      )
    )
}
