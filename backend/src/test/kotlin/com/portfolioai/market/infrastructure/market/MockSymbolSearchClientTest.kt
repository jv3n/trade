package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.MarketUnavailableException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on [MockSymbolSearchClient] — the mock backs the autocomplete dropdown when the user runs
 * locally without a Twelve Data key, so the same matching expectations as a real provider must hold
 * (otherwise an offline dev would code against behaviour that flips the moment they switch to
 * live).
 *
 * What's pinned :
 * - **Prefix on symbol, substring on name** — typing `AAP` returns `AAPL`, typing `apple` does too.
 * - **Empty / blank query → empty list** — no point hitting an upstream with `q=""` and the same
 *   contract holds for the mock.
 * - **`limit` is honoured** — applied to the result set without internal clamping ; the upstream
 *   contract is "trust the caller", because
 *   [com.portfolioai.market.application.SymbolSearchService] clamps `[1, MAX_LIMIT]` before
 *   reaching the adapter.
 * - **Reserved test paths** — `RATELIMIT` raises [MarketUnavailableException] (503 path), `UNKNOWN`
 *   returns an empty list. Mirrors the chart mock so the same UI states are exercised in both.
 * - **Stable ordering** — same query always returns the same order. Mock determinism matters
 *   because the dashboard sidebar autocomplete is asserted against in `dashboard.spec` ; a flaky
 *   order would break that test on every reload.
 */
class MockSymbolSearchClientTest {

  private val client = MockSymbolSearchClient()

  @Test
  fun `prefix match on symbol returns the relevant entries`() {
    // `AAP` is a strict prefix of `AAPL` and nothing else in the seed — pinning this so a future
    // seed expansion that adds `AAPS` or similar doesn't silently change the test outcome.
    val results = client.search("AAP", 10)

    assertEquals(1, results.size)
    assertEquals("AAPL", results[0].symbol)
    assertEquals("Apple Inc", results[0].name)
    assertEquals("NASDAQ", results[0].exchange)
  }

  @Test
  fun `substring match on name returns the relevant entries`() {
    // The user types the company name, not the ticker — common path for less-known symbols.
    val results = client.search("apple", 10)

    assertTrue(results.any { it.symbol == "AAPL" })
  }

  @Test
  fun `case-insensitive match — lowercase typing finds uppercase symbols`() {
    val lower = client.search("nvda", 10)
    val upper = client.search("NVDA", 10)

    assertEquals(upper, lower)
    assertTrue(lower.any { it.symbol == "NVDA" })
  }

  @Test
  fun `blank query returns an empty list without hitting the seed`() {
    assertTrue(client.search("", 10).isEmpty())
    assertTrue(client.search("   ", 10).isEmpty())
  }

  @Test
  fun `RATELIMIT reserved query raises MarketUnavailableException`() {
    // Lets a dev exercise the 503 error UI without provisioning a real Twelve Data key.
    val ex = assertThrows<MarketUnavailableException> { client.search("RATELIMIT", 10) }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `UNKNOWN reserved query returns an empty list`() {
    // Mirrors what the live adapter would emit on a no-match search — keeps the no-results UI path
    // reachable offline.
    assertTrue(client.search("UNKNOWN", 10).isEmpty())
  }

  @Test
  fun `limit caps the result count`() {
    // Single-letter prefix matches a lot — perfect to exercise the cap.
    val capped = client.search("A", 2)
    assertEquals(2, capped.size)
  }

  @Test
  fun `limit larger than the seed simply returns everything that matches`() {
    // Adapter trusts the caller and doesn't clamp — `SymbolSearchService` is the canonical
    // clamping boundary `[1, MAX_LIMIT]`. With a single-letter prefix and no internal cap, we
    // simply get every seeded match (still a finite number, the seed is ~30).
    val results = client.search("A", 9999)
    assertTrue(results.isNotEmpty())
    assertTrue(results.size <= 30) // bounded by the seed, not by the adapter's logic
  }

  @Test
  fun `same query returns a stable ordering across calls`() {
    val first = client.search("S", 10)
    val second = client.search("S", 10)
    assertEquals(first, second)
  }

  @Test
  fun `TSX symbols with dot suffix are searchable by their canonical name`() {
    // Real-world Wealthsimple CA case — user types `royal` and expects `RY.TO`. Pinning so a future
    // refactor that strips dots from the seed (or normalises differently) doesn't break this path.
    val results = client.search("royal", 10)
    assertTrue(results.any { it.symbol == "RY.TO" })
  }
}
