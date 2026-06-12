package com.portfolioai.stats

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.stats.application.StatEntryCsvDecoder
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.application.dto.StatRadarCreateRequest
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean

/**
 * Integration test on [StatEntryService.findAllPaged] + [StatEntryService.createFromRadar] + JPA →
 * Postgres (Testcontainers via the launcher-session bootstrap). Pins the read + radar-create paths
 * that back the frontend stats table since V2 turned the dataset from global into **admin-global +
 * per-user** :
 *
 * - **Default ordering** — with no `sort` the service falls back to `tradeDate desc, createdAt
 *   desc`, so page 0 carries the freshest rows.
 * - **A URL sort is honoured** — a `pushPercent asc` page request actually orders by that column.
 * - **Pagination slices and reports totals**.
 * - **Visibility** — a user sees the global/admin (CSV-import) rows plus their own radar picks, and
 *   **never** another user's radar pick.
 * - **Radar create** — `createFromRadar` seeds a partial row (only ticker / gap / open known),
 *   owned by the caller, tagged [StatSource.RADAR].
 *
 * `AuthService` is overridden with `@MockitoBean` (the real one reads an empty `SecurityContext`
 * outside a request) and configured per test to return a seeded user — same pattern as
 * `JournalIntegrationTest`.
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

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    userRepository.deleteAll()
    testUser = saveUser("trader")
    otherUser = saveUser("other")
    whenever(authService.getCurrentUser()).thenReturn(testUser)

    // Three GLOBAL rows via the ADMIN CSV import (createdBy = null → visible to everyone).
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

  @Test
  fun `defaults to newest-first when the page request carries no sort`() {
    val page = service.findAllPaged(PageRequest.of(0, 50))

    assertEquals(3, page.totalElements)
    assertEquals(listOf("ALDX", "GBOX", "CEI"), page.content.map { it.ticker })
  }

  @Test
  fun `honours a user-supplied sort over the default`() {
    val page = service.findAllPaged(PageRequest.of(0, 50, Sort.by(Sort.Order.asc("pushPercent"))))

    // +5.95 (ALDX) < +8.11 (CEI) < +8.57 (GBOX)
    assertEquals(listOf("ALDX", "CEI", "GBOX"), page.content.map { it.ticker })
  }

  @Test
  fun `paginates — page size bounds the slice while totalElements counts the whole dataset`() {
    val firstPage = service.findAllPaged(PageRequest.of(0, 2))

    assertEquals(3, firstPage.totalElements, "total counts every row, not just the page")
    assertEquals(2, firstPage.totalPages)
    assertEquals(listOf("ALDX", "GBOX"), firstPage.content.map { it.ticker })

    val secondPage = service.findAllPaged(PageRequest.of(1, 2))
    assertEquals(listOf("CEI"), secondPage.content.map { it.ticker })
  }

  @Test
  fun `createFromRadar seeds a partial row owned by the caller and tagged RADAR`() {
    val dto =
      service.createFromRadar(
        StatRadarCreateRequest(
          ticker = "gels",
          gapUpPercent = BigDecimal("72.00"),
          openPrice = BigDecimal("3.5000"),
          tradeDate = LocalDate.of(2026, 6, 11),
        )
      )

    assertEquals("GELS", dto.ticker, "ticker normalised on create")
    assertEquals(StatSource.RADAR, dto.source)
    assertEquals(testUser.id, dto.createdBy)
    // Only the scan-time fields are known — the setup flags + EOD outcome stay null.
    assertNull(dto.floatSharesMillions)
    assertNull(dto.highPrice)
    assertNull(dto.eodPrice)
    assertNull(dto.pushPercent)
  }

  @Test
  fun `createFromRadar defaults the trade date to today when omitted`() {
    val dto =
      service.createFromRadar(
        StatRadarCreateRequest(
          ticker = "GELS",
          gapUpPercent = BigDecimal("72.00"),
          openPrice = BigDecimal("3.5000"),
        )
      )

    assertEquals(LocalDate.now(java.time.ZoneId.of("America/New_York")), dto.tradeDate)
  }

  @Test
  fun `a user sees the global rows plus their own radar pick`() {
    service.createFromRadar(
      StatRadarCreateRequest("MINE", BigDecimal("80.00"), BigDecimal("2.0000"))
    )

    val visible = service.findAllPaged(PageRequest.of(0, 50)).content.map { it.ticker }

    assertEquals(4, visible.size, "3 global IMPORT rows + 1 own RADAR pick")
    assertTrue(visible.contains("MINE"))
    assertTrue(visible.containsAll(listOf("ALDX", "GBOX", "CEI")))
  }

  @Test
  fun `a user never sees another user's radar pick — only global rows leak across users`() {
    // testUser seeds a private radar pick.
    service.createFromRadar(
      StatRadarCreateRequest("SECRET", BigDecimal("90.00"), BigDecimal("1.5000"))
    )

    // Switch the current user to otherUser.
    whenever(authService.getCurrentUser()).thenReturn(otherUser)
    val visibleToOther = service.findAllPaged(PageRequest.of(0, 50)).content.map { it.ticker }

    assertTrue(
      visibleToOther.containsAll(listOf("ALDX", "GBOX", "CEI")),
      "the global IMPORT rows stay visible to everyone",
    )
    assertTrue(!visibleToOther.contains("SECRET"), "another user's RADAR pick must not leak")
    assertEquals(3, visibleToOther.size)
  }

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
