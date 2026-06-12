package com.portfolioai.screener.infrastructure.screener

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Tests on [MockTickerFundamentalsClient] — the dev-only enrichment source. The `/radar` page
 * renders float + premarket volume from this in mock mode, so two properties matter: the values sit
 * in a plausible GUS band, and they're **deterministic per symbol** (the table must not shuffle
 * float/volume across refreshes of the same snapshot).
 */
class MockTickerFundamentalsClientTest {

  private val client = MockTickerFundamentalsClient()

  @Test
  fun `returns a float inside the plausible 3M-49M band`() {
    val f = client.fetch("GNS")
    assertNotNull(f.floatShares)
    assertTrue(f.floatShares!! in 3_000_000L..49_000_000L, "float=${f.floatShares}")
  }

  @Test
  fun `returns a non-null premarket volume`() {
    assertNotNull(client.fetch("GNS").premarketVolume)
  }

  @Test
  fun `is deterministic per symbol`() {
    assertEquals(client.fetch("GNS"), client.fetch("GNS"))
  }
}
