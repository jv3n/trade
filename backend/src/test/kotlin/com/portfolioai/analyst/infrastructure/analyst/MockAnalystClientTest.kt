package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.market.domain.MarketUnavailableException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on [MockAnalystClient]. The mock is what the dossier hits without a Finnhub key (default
 * for onboarding / CI) — its determinism is load-bearing : two reloads of the same dossier must
 * render the same panel for the e2e visual regression to mean anything. The reserved symbols
 * (`UNKNOWN`, `RATELIMIT`, `NOTARGET`) drive the empty / error / degraded UI states without needing
 * a live provider.
 */
class MockAnalystClientTest {

  private val client = MockAnalystClient()

  @Test
  fun `is deterministic per symbol`() {
    // Same symbol → same breakdown across calls. Without this, visual regression on the dossier
    // panel would be flaky and re-runs of `tilt up` would surface different recommendations.
    val first = client.fetch("AAPL")
    val second = client.fetch("AAPL")

    assertEquals(first.strongBuy, second.strongBuy)
    assertEquals(first.buy, second.buy)
    assertEquals(first.hold, second.hold)
    assertEquals(first.sell, second.sell)
    assertEquals(first.strongSell, second.strongSell)
    assertEquals(first.priceTarget, second.priceTarget)
  }

  @Test
  fun `produces different breakdowns across symbols`() {
    // Without per-symbol variation the dossier would feel hollow — every ticker would surface
    // the same chip and the same target band.
    val a = client.fetch("AAPL")
    val b = client.fetch("MSFT")

    // Breakdowns can collide on rare hash matches, but the price target band uses a different
    // random draw and is virtually guaranteed to differ — assert on the target which is the
    // most visible piece on the front.
    assertNotEquals(a.priceTarget, b.priceTarget)
  }

  @Test
  fun `UNKNOWN throws NoSuchElementException for the empty-state UI`() {
    assertThrows<NoSuchElementException> { client.fetch("UNKNOWN") }
  }

  @Test
  fun `RATELIMIT throws MarketUnavailableException for the inline-error UI`() {
    val ex = assertThrows<MarketUnavailableException> { client.fetch("RATELIMIT") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `NOTARGET drops the price target so the degraded layout is reproducible`() {
    // The Finnhub /price-target endpoint sometimes 401s — the front must handle a snapshot with
    // recommendations only. The reserved symbol lets us reproduce that state without flipping
    // providers.
    val out = client.fetch("NOTARGET")

    assertNull(out.priceTarget)
    assertNotNull(out.history) // recommendations are still present
    assertTrue(out.totalAnalysts > 0)
  }

  @Test
  fun `produces a 6-month history sorted oldest-first`() {
    val out = client.fetch("AAPL")

    assertEquals(6, out.history.size)
    val periods = out.history.map { it.period }
    assertEquals(periods.sorted(), periods, "history must come back oldest-first")
    // Head of stream matches the newest history entry — same convention as the Finnhub mapper.
    assertEquals(out.asOf, out.history.last().period)
  }

  @Test
  fun `case-normalises the symbol on the output`() {
    // The dossier may pass through a lowercase symbol from the URL ; the snapshot must come back
    // uppercase to align with the rest of the dossier (watchlist, narrative…).
    val out = client.fetch("aapl")
    assertEquals("AAPL", out.symbol)
  }

  @Test
  fun `total analysts matches the sum of the buckets`() {
    val out = client.fetch("AAPL")
    val sum = out.strongBuy + out.buy + out.hold + out.sell + out.strongSell
    assertEquals(sum, out.totalAnalysts)
  }
}
