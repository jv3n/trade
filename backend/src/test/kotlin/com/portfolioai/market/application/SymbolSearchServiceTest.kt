package com.portfolioai.market.application

import com.portfolioai.market.infrastructure.market.SymbolSearchClient
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify

/**
 * Tests on [SymbolSearchService] — focuses on the limit clamping behaviour the service adds on top
 * of the raw [SymbolSearchClient]. Caching is a Spring concern and is exercised at the integration
 * level (`BackendApplicationTests` boots the real `CaffeineCacheManager`) — unit-testing the
 * annotation here would just re-test Spring. The existence-check semantics (exact-match, blank
 * short-circuit) live in [SymbolValidator] and are pinned by [SymbolValidatorTest].
 *
 * What we pin :
 * - **Limit clamping** — `0` and `-1` bump up to `1`, big numbers get capped at [MAX_LIMIT] so an
 *   accidental `?limit=9999` doesn't ask Twelve Data for a 100-row response we couldn't render.
 */
class SymbolSearchServiceTest {

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
