package com.portfolioai.market.infrastructure.market

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Tests on [SpdrSectorEtfs] — the table that maps a GICS sector label to the SPDR Select Sector
 * ETF. Two responsibilities pinned :
 *
 * 1. **Canonical mapping is intact for the 11 covered sectors** — a future refactor that drops one
 *    entry would silently make the corresponding sector unavailable on the chart overlay. The tests
 *    sample one canonical key per ETF so a missing row breaks the build.
 * 2. **Synonym resolution** — Twelve Data and other providers occasionally return aliases
 *    ("Information Technology" vs "Technology", "Health Care" vs "Healthcare"). Pinning the common
 *    ones here means a fresh provider switch doesn't quietly start returning 404 for legitimate
 *    sectors.
 */
class SpdrSectorEtfsTest {

  // -------------------------------------------------------------------- canonical labels

  @Test
  fun `Technology canonical label resolves to XLK`() {
    val result = SpdrSectorEtfs.resolve("Technology")
    assertNotNull(result)
    assertEquals("XLK", result?.etfSymbol)
  }

  @Test
  fun `each of the 11 SPDR sectors resolves to its dedicated ETF`() {
    // One sample per ETF so a future maintainer who drops or rewrites a mapping entry is told
    // exactly which one. Listed in alphabetical sector order to make the failure message obvious.
    assertEquals("XLC", SpdrSectorEtfs.resolve("Communication Services")?.etfSymbol)
    assertEquals("XLY", SpdrSectorEtfs.resolve("Consumer Discretionary")?.etfSymbol)
    assertEquals("XLP", SpdrSectorEtfs.resolve("Consumer Staples")?.etfSymbol)
    assertEquals("XLE", SpdrSectorEtfs.resolve("Energy")?.etfSymbol)
    assertEquals("XLF", SpdrSectorEtfs.resolve("Financials")?.etfSymbol)
    assertEquals("XLV", SpdrSectorEtfs.resolve("Healthcare")?.etfSymbol)
    assertEquals("XLI", SpdrSectorEtfs.resolve("Industrials")?.etfSymbol)
    assertEquals("XLB", SpdrSectorEtfs.resolve("Materials")?.etfSymbol)
    assertEquals("XLRE", SpdrSectorEtfs.resolve("Real Estate")?.etfSymbol)
    assertEquals("XLK", SpdrSectorEtfs.resolve("Technology")?.etfSymbol)
    assertEquals("XLU", SpdrSectorEtfs.resolve("Utilities")?.etfSymbol)
  }

  // -------------------------------------------------------------------- synonyms

  @Test
  fun `Information Technology synonym resolves to Technology XLK`() {
    // Twelve Data's documented label is "Technology" but historically some upstreams return the
    // longer GICS form. Synonym table covers both.
    val result = SpdrSectorEtfs.resolve("Information Technology")
    assertEquals("XLK", result?.etfSymbol)
    assertEquals("Technology", result?.sector) // canonical label preserved for the legend
  }

  @Test
  fun `Health Care with a space resolves to Healthcare XLV`() {
    val result = SpdrSectorEtfs.resolve("Health Care")
    assertEquals("XLV", result?.etfSymbol)
  }

  @Test
  fun `Consumer Cyclical alias resolves to Consumer Discretionary XLY`() {
    // Yahoo Finance and a few other providers use "Consumer Cyclical" / "Consumer Defensive" —
    // not GICS-canonical but common enough to map.
    assertEquals("XLY", SpdrSectorEtfs.resolve("Consumer Cyclical")?.etfSymbol)
    assertEquals("XLP", SpdrSectorEtfs.resolve("Consumer Defensive")?.etfSymbol)
  }

  // -------------------------------------------------------------------- normalisation

  @Test
  fun `case-insensitive matching — lowercase input resolves the same`() {
    val lower = SpdrSectorEtfs.resolve("technology")
    val upper = SpdrSectorEtfs.resolve("Technology")
    assertEquals(upper, lower)
  }

  @Test
  fun `whitespace around the label is trimmed`() {
    val padded = SpdrSectorEtfs.resolve("  Technology  ")
    assertEquals("XLK", padded?.etfSymbol)
  }

  // -------------------------------------------------------------------- unmapped

  @Test
  fun `null input returns null`() {
    assertNull(SpdrSectorEtfs.resolve(null))
  }

  @Test
  fun `blank input returns null`() {
    assertNull(SpdrSectorEtfs.resolve(""))
    assertNull(SpdrSectorEtfs.resolve("   "))
  }

  @Test
  fun `unmapped sector returns null rather than guessing`() {
    // "Conglomerates" used to be a sector before the GICS reshuffle and still appears occasionally
    // for legacy industrials. We refuse to guess (there's no clean SPDR equivalent) — the caller
    // turns this into a 404 / "no sector benchmark available" inline message.
    assertNull(SpdrSectorEtfs.resolve("Conglomerates"))
    assertNull(SpdrSectorEtfs.resolve("Crypto"))
  }
}
