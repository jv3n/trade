package com.portfolioai.stats

import com.portfolioai.stats.application.StatEntryCsvDecoder
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.test.context.TestPropertySource

/**
 * Integration test on [StatEntryService.findAllPaged] + JPA → Postgres (Testcontainers via the
 * launcher-session bootstrap). Pins the read path that backs the frontend stats table :
 *
 * - **Default ordering** — with no `sort` in the page request the service falls back to `tradeDate
 *   desc, createdAt desc`, so page 0 carries the freshest rows.
 * - **A URL sort is honoured** — a `pushPercent asc` page request actually orders by that column
 *   (the bug the journal hit was the resolver silently dropping the URL sort).
 * - **Pagination slices and reports totals** — `totalElements` counts the whole dataset while
 *   `content` is bounded to the page size.
 *
 * The stats table is a **global dataset** (no `user_id`) — so no `AuthService` mock here.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class StatsListingIntegrationTest {

  @Autowired private lateinit var service: StatEntryService
  @Autowired private lateinit var repo: StatEntryRepository

  private val header = StatEntryCsvDecoder.HEADERS.joinToString(",")

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
    // Three rows on distinct dates. Push% differs per row so the sort assertions are unambiguous :
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
}
