package com.portfolioai.stats

import com.portfolioai.stats.application.StatEntryCsvDecoder
import com.portfolioai.stats.application.StatEntryService
import com.portfolioai.stats.domain.StatSource
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.math.BigDecimal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.TestPropertySource

/**
 * End-to-end integration test on [StatEntryService.importCsv] + JPA → Postgres (Testcontainers via
 * the launcher-session bootstrap, no per-class plumbing).
 *
 * Pins two things the unit tests can't reach :
 *
 * - **The derived columns survive the round-trip** — `%push` / `%LOD` / `%EOD` are computed at
 *   insert and read back from the real `NUMERIC(8,2)` columns with the expected value encoding.
 * - **Atomic batch** — a CSV with one bad row persists nothing (`created == 0`).
 *
 * The stats table is a **global dataset** — no `user_id`, no per-user scoping — so there is no
 * `AuthService` mock here (unlike `JournalIntegrationTest`). ADMIN-only write access is enforced at
 * the HTTP layer, not in the service.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class StatsImportIntegrationTest {

  @Autowired private lateinit var service: StatEntryService
  @Autowired private lateinit var repo: StatEntryRepository

  private val header = StatEntryCsvDecoder.HEADERS.joinToString(",")

  @BeforeEach
  fun setUp() {
    repo.deleteAll()
  }

  @Test
  fun `import persists the manual columns and the three computed percentages`() {
    // BAC : open 4.20, high 4.45, lod 3.05, eod 3.10
    //   %push = +5.95 , %LOD = -27.38 , %EOD = -26.19
    val csv =
      header +
        "\n2026-06-04,bac,52.0,12.5,8.3,false,false,false,false,Clean GUS fade,4.2000,4.4500,3.0500,3.1000"

    val result = service.importCsv(csv)

    assertEquals(1, result.parsed)
    assertEquals(1, result.created)
    assertTrue(result.errors.isEmpty())

    val saved = repo.findAll().single()
    assertEquals("BAC", saved.ticker, "ticker normalised on import")
    assertEquals(0, saved.gapUpPercent!!.compareTo(BigDecimal("52.0")))
    assertEquals(false, saved.ssr)
    // CSV import = the curated global dataset : IMPORT-sourced, owned by nobody (readable by all).
    assertEquals(StatSource.IMPORT, saved.source)
    assertNull(saved.createdBy)
    // The derived columns — computed at insert, non-null for a complete CSV row.
    assertEquals(0, saved.pushPercent!!.compareTo(BigDecimal("5.95")), "push=${saved.pushPercent}")
    assertEquals(0, saved.lodPercent!!.compareTo(BigDecimal("-27.38")), "lod=${saved.lodPercent}")
    assertEquals(0, saved.eodPercent!!.compareTo(BigDecimal("-26.19")), "eod=${saved.eodPercent}")
  }

  @Test
  fun `a single bad row aborts the whole batch — nothing is persisted`() {
    val csv =
      header +
        "\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000" + // ok
        "\n2026-06-03,BBIG,38.0,45.2,4.1,false,false,true,false,,0,2.3000,1.9000,2.0500" // open = 0
    // -> bad

    val result = service.importCsv(csv)

    assertEquals(0, result.created, "atomic batch — no partial insert")
    assertTrue(result.errors.isNotEmpty())
    assertEquals(0, repo.count(), "table must stay empty when any row fails")
  }

  @Test
  fun `import is multi-row and counts every persisted row`() {
    val csv =
      header +
        "\n2026-06-04,BAC,52.0,12.5,8.3,false,false,false,false,,4.2000,4.4500,3.0500,3.1000" +
        "\n2026-06-02,GBOX,61.0,8.7,22.4,true,false,false,false,,3.5000,3.8000,3.2000,3.4000" +
        "\n2026-05-12,CEI,77.0,38.5,2.8,false,true,true,false,,1.8500,2.0000,1.5000,1.5500"

    val result = service.importCsv(csv)

    assertEquals(3, result.parsed)
    assertEquals(3, result.created)
    assertEquals(3, repo.count())
  }
}
