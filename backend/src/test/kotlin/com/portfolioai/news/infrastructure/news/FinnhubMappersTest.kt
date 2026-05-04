package com.portfolioai.news.infrastructure.news

import java.time.Instant
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Tests on the pure conversion `FinnhubNewsItem.toDomain` — no HTTP, no Spring. Each test pins a
 * non-obvious behaviour we observed on the real Finnhub payload :
 * - **`datetime` is Unix seconds**, not milliseconds (a common gotcha with finance APIs that
 *   default to either based on locale).
 * - **`image: ""`** is Finnhub's idiom for "no thumbnail" — we coerce to `null` so the UI can
 *   simply branch on absence.
 * - **`summary: ""`** likewise on press-release-style entries.
 * - **`category: null`** stays null — keeps the optional-ness explicit through the chain.
 */
class FinnhubMappersTest {

  @Test
  fun `maps a fully populated item to the domain shape`() {
    val src =
      FinnhubNewsItem(
        id = 12345L,
        category = "company news",
        datetime = 1700200000L,
        headline = "Big launch announced",
        image = "https://example.com/thumb.jpg",
        source = "Reuters",
        summary = "Apple announces new product…",
        url = "https://example.com/article",
      )

    val out = src.toDomain("AAPL")

    assertEquals("12345", out.id) // converted from Long → String to keep IDs provider-agnostic
    assertEquals("AAPL", out.symbol)
    assertEquals("Big launch announced", out.headline)
    assertEquals("Apple announces new product…", out.summary)
    assertEquals("Reuters", out.source)
    assertEquals("https://example.com/article", out.url)
    assertEquals("https://example.com/thumb.jpg", out.imageUrl)
    assertEquals("company news", out.category)
    assertEquals(Instant.ofEpochSecond(1700200000L), out.publishedAt)
  }

  @Test
  fun `coerces empty image to null`() {
    // Finnhub returns `""` rather than omitting the field on text-only items. Surfacing `""`
    // to the UI would render a broken `<img>` tag — coercing to null lets the template branch
    // cleanly on absence.
    val out =
      FinnhubNewsItem(
          id = 1L,
          category = null,
          datetime = 1700000000L,
          headline = "h",
          image = "",
          source = "s",
          summary = null,
          url = "u",
        )
        .toDomain("AAPL")

    assertNull(out.imageUrl)
  }

  @Test
  fun `coerces empty summary to null`() {
    // Press releases and brief alerts come through with `summary: ""`. The dossier UI distinguishes
    // "no summary" (just headline) from "real summary" — null is the cleaner signal.
    val out =
      FinnhubNewsItem(
          id = 1L,
          category = "earnings",
          datetime = 1700000000L,
          headline = "h",
          image = null,
          source = "s",
          summary = "",
          url = "u",
        )
        .toDomain("AAPL")

    assertNull(out.summary)
  }

  @Test
  fun `passes null fields through unchanged`() {
    val out =
      FinnhubNewsItem(
          id = 1L,
          category = null,
          datetime = 1700000000L,
          headline = "h",
          image = null,
          source = "s",
          summary = null,
          url = "u",
        )
        .toDomain("AAPL")

    assertNull(out.category)
    assertNull(out.imageUrl)
    assertNull(out.summary)
  }
}
