package com.portfolioai.market.application

import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.market.domain.SymbolSearchClient
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [SymbolValidator] — the gate the watchlist add path uses to reject unknown symbols. Pins
 * the *exact-match, case-insensitive* contract that's the whole point of this bean : a fuzzy
 * provider returning "near matches" must NOT slip a typo through. The split into two beans
 * ([SymbolValidator] depends on [SymbolSearchService] rather than self-injecting through `@Lazy
 * self`) is structural — see the class-level KDoc on [SymbolValidator] — but invisible from a unit
 * test's perspective.
 *
 * What we pin :
 * - **`exists(symbol)` is exact-match, case-insensitive** — the upstream returns a list of
 *   relevance-ranked matches ; we only accept the entry whose `symbol` field is the user's input. A
 *   search for `AAP` returns `AAPL` first, but `exists("AAP")` is `true` only because `AAP` is also
 *   a real ticker (Advance Auto Parts). Without exact-match the watchlist would silently absorb
 *   typos as their fuzzy promotion.
 * - **Blank symbol short-circuits** — no client call, returns false. Same defensive shape as the
 *   client adapters ; a blank input is never a valid ticker.
 */
class SymbolValidatorTest {

  @Test
  fun `exists returns true when an exact case-insensitive match is in the upstream results`() {
    val client: SymbolSearchClient = mock {
      on { search(any(), any()) } doReturn
        listOf(
          SymbolMatch("AAPL", "Apple Inc", "NASDAQ"),
          SymbolMatch("AAP", "Advance Auto Parts Inc", "NYSE"),
        )
    }
    val validator = SymbolValidator(SymbolSearchService(client))

    assertTrue(validator.exists("AAPL"))
    assertTrue(validator.exists("aapl"))
    assertTrue(validator.exists("AAP"))
  }

  @Test
  fun `exists returns false when the upstream finds nothing matching exactly`() {
    // Upstream returns "near matches" for `XYZQ` (a fuzzy provider would suggest `XYZ`) — none is
    // an exact match, so we reject. This is the core guard against `watchlist add XXXXX`
    // succeeding.
    val client: SymbolSearchClient = mock {
      on { search(any(), any()) } doReturn
        listOf(SymbolMatch("XYZ", "XYZ Corp", "NYSE"), SymbolMatch("XYZA", "Other Co", "NYSE"))
    }
    val validator = SymbolValidator(SymbolSearchService(client))

    assertFalse(validator.exists("XYZQ"))
  }

  @Test
  fun `exists returns false when the upstream returns no results`() {
    val client: SymbolSearchClient = mock { on { search(any(), any()) } doReturn emptyList() }
    val validator = SymbolValidator(SymbolSearchService(client))

    assertFalse(validator.exists("XXXXX"))
  }

  @Test
  fun `exists on blank input returns false without calling the upstream`() {
    val client: SymbolSearchClient = mock()
    val validator = SymbolValidator(SymbolSearchService(client))

    assertFalse(validator.exists(""))
    assertFalse(validator.exists("   "))
    verify(client, never()).search(any(), any())
  }
}
