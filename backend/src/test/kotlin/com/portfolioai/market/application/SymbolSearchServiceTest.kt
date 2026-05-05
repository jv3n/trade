package com.portfolioai.market.application

import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.market.infrastructure.market.SymbolSearchClient
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [SymbolSearchService] — focuses on the two behaviours the service adds on top of the raw
 * [SymbolSearchClient] : the [SymbolSearchService.validate] gate (used by the watchlist add path)
 * and the limit clamping. Caching is a Spring concern and is exercised at the integration level
 * (`BackendApplicationTests` boots the real `CaffeineCacheManager`) — unit-testing the annotation
 * here would just re-test Spring.
 *
 * What we pin :
 * - **`validate(symbol)` is exact-match, case-insensitive** — the upstream returns a list of
 *   relevance-ranked matches ; we only accept the entry whose `symbol` field is the user's input. A
 *   search for `AAP` returns `AAPL` first, but `validate("AAP")` is `false` because `AAP` is also a
 *   real ticker (Advance Auto Parts) and we want to be strict about which one the user asked for.
 * - **Blank symbol short-circuits** — no client call, validate returns false. Same defensive shape
 *   as the client adapters.
 * - **Limit clamping** — `0` and `-1` bump up to `1`, big numbers get capped.
 */
class SymbolSearchServiceTest {

  @Test
  fun `validate returns true when an exact case-insensitive match is in the upstream results`() {
    val client: SymbolSearchClient = mock {
      on { search(any(), any()) } doReturn
        listOf(
          SymbolMatch("AAPL", "Apple Inc", "NASDAQ"),
          SymbolMatch("AAP", "Advance Auto Parts Inc", "NYSE"),
        )
    }
    val service = SymbolSearchService(client)

    assertTrue(service.validate("AAPL"))
    assertTrue(service.validate("aapl"))
    assertTrue(service.validate("AAP"))
  }

  @Test
  fun `validate returns false when the upstream finds nothing matching exactly`() {
    // Upstream returns "near matches" for `XYZQ` (a fuzzy provider would suggest `XYZ`) — none is
    // an exact match, so we reject. This is the core guard against `watchlist add XXXXX`
    // succeeding.
    val client: SymbolSearchClient = mock {
      on { search(any(), any()) } doReturn
        listOf(SymbolMatch("XYZ", "XYZ Corp", "NYSE"), SymbolMatch("XYZA", "Other Co", "NYSE"))
    }
    val service = SymbolSearchService(client)

    assertFalse(service.validate("XYZQ"))
  }

  @Test
  fun `validate returns false when the upstream returns no results`() {
    val client: SymbolSearchClient = mock { on { search(any(), any()) } doReturn emptyList() }
    val service = SymbolSearchService(client)

    assertFalse(service.validate("XXXXX"))
  }

  @Test
  fun `validate on blank input returns false without calling the upstream`() {
    val client: SymbolSearchClient = mock()
    val service = SymbolSearchService(client)

    assertFalse(service.validate(""))
    assertFalse(service.validate("   "))
    verify(client, never()).search(any(), any())
  }

  @Test
  fun `search clamps the limit to the safe bounds`() {
    val client: SymbolSearchClient = mock { on { search(any(), any()) } doReturn emptyList() }
    val service = SymbolSearchService(client)

    service.search("aapl", -5)
    service.search("aapl", 9999)

    // Negative / zero collapses to 1 ; very large is clamped to MAX_LIMIT (50).
    verify(client).search("aapl", 1)
    verify(client).search("aapl", 50)
  }
}
