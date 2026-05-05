package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.MarketUnavailableException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on [MockSectorClassifier] — the mock backs the "Sector" benchmark overlay when the user
 * runs locally without a Twelve Data key. Same convention as [MockSymbolSearchClient] : the mock
 * must mirror what the live adapter does for the same inputs, otherwise an offline dev codes
 * against behaviour that flips the moment they switch to live.
 *
 * What's pinned :
 * - **Symbol seeded → returns the SPDR ETF for its sector** (AAPL → XLK Technology, JPM → XLF
 *   Financials, etc.). Tests one per sector that's actually in the seed so a future seed reshuffle
 *   doesn't silently break the mapping for popular tickers.
 * - **Symbol absent from the seed → 404** via [NoSuchElementException]. Same surface as a real
 *   provider that returned no profile.
 * - **Reserved test paths** — `RATELIMIT` raises [MarketUnavailableException] (503 path), `UNKNOWN`
 *   raises [NoSuchElementException] (404 path). Mirrors the chart and search mocks so the same UI
 *   states are exercised across all three.
 * - **Case-insensitive lookup** — `aapl` works the same as `AAPL`.
 * - **TSX symbols with `.TO` suffix** — covered (RY.TO → XLF) so the typical Wealthsimple CA user
 *   gets a useful overlay.
 */
class MockSectorClassifierTest {

  private val client = MockSectorClassifier()

  @Test
  fun `AAPL classifies as Technology XLK`() {
    val result = client.classify("AAPL")

    assertEquals("Technology", result.sector)
    assertEquals("XLK", result.etfSymbol)
    assertEquals("Technology Select Sector SPDR Fund", result.etfName)
  }

  @Test
  fun `JPM classifies as Financials XLF`() {
    val result = client.classify("JPM")

    assertEquals("Financials", result.sector)
    assertEquals("XLF", result.etfSymbol)
  }

  @Test
  fun `META classifies as Communication Services XLC, not Technology`() {
    // Common confusion — Meta sits under Communication Services in GICS, not Tech. Pin the right
    // ETF so a future seed maintainer doesn't move it back to XLK out of "common sense".
    val result = client.classify("META")

    assertEquals("Communication Services", result.sector)
    assertEquals("XLC", result.etfSymbol)
  }

  @Test
  fun `TSX symbol RY-TO classifies via the TSX-suffixed seed entry`() {
    // Wealthsimple Canadian users hold a lot of TSX symbols ; the mock wouldn't be useful if it
    // only covered NASDAQ. Pin one TSX entry to defend against a future seed cleanup that drops
    // the .TO suffix variants.
    val result = client.classify("RY.TO")

    assertEquals("Financials", result.sector)
    assertEquals("XLF", result.etfSymbol)
  }

  @Test
  fun `case-insensitive lookup — lowercase input finds the same mapping`() {
    val lower = client.classify("aapl")
    val upper = client.classify("AAPL")

    assertEquals(upper, lower)
  }

  @Test
  fun `whitespace around the symbol is trimmed`() {
    val padded = client.classify("  AAPL  ")
    assertEquals("XLK", padded.etfSymbol)
  }

  @Test
  fun `unknown symbol raises NoSuchElementException`() {
    // Same path as a live provider that returned 404 on /profile — frontend turns this into a
    // polite "no sector benchmark available" inline rather than a hard error.
    val ex = assertThrows<NoSuchElementException> { client.classify("ZZZZ") }
    assertTrue(ex.message?.contains("ZZZZ") ?: false)
  }

  @Test
  fun `RATELIMIT reserved symbol raises MarketUnavailableException`() {
    val ex = assertThrows<MarketUnavailableException> { client.classify("RATELIMIT") }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `UNKNOWN reserved symbol raises NoSuchElementException`() {
    val ex = assertThrows<NoSuchElementException> { client.classify("UNKNOWN") }
    assertTrue(ex.message?.contains("UNKNOWN") ?: false)
  }
}
