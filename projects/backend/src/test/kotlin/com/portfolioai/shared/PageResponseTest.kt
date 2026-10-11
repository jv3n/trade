package com.portfolioai.shared

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import tools.jackson.databind.json.JsonMapper

/**
 * Pins the JSON envelope of the paged listings (#591) — journal trades and days, stats, account
 * movements. The frontend's paged readers read exactly these five keys ; Spring Data's own
 * `PageImpl` serialization, which the controllers used to return, promised none of them.
 *
 * - **The keys are ours and only ours** — a field added or renamed here is an API change, so the
 *   test lists the whole set rather than probing a few.
 * - **The page index is zero-based** under `number`, and the totals cover the whole dataset, not
 *   the slice.
 */
class PageResponseTest {

  private val json = JsonMapper.builder().build()

  /** Index 1 of 5 trades split by 2 — the slice holds the third and fourth trades. */
  private val secondPage =
    PageImpl(listOf("BNZI", "KTTA"), PageRequest.of(1, 2), 5).toPageResponse()

  @Test
  fun `serializes to the five keys the frontend reads, nothing more`() {
    val keys = json.readTree(json.writeValueAsString(secondPage)).propertyNames().toSet()

    assertEquals(setOf("content", "number", "size", "totalElements", "totalPages"), keys)
  }

  @Test
  fun `carries the zero-based page index and the totals of the whole dataset`() {
    assertEquals(listOf("BNZI", "KTTA"), secondPage.content)
    assertEquals(1, secondPage.number)
    assertEquals(2, secondPage.size)
    assertEquals(5, secondPage.totalElements)
    assertEquals(3, secondPage.totalPages)
  }
}
