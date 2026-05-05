package com.portfolioai.watchlist.application

import com.portfolioai.market.application.SymbolSearchService
import com.portfolioai.market.domain.MarketUnavailableException
import com.portfolioai.watchlist.domain.WatchlistEntry
import com.portfolioai.watchlist.infrastructure.persistence.WatchlistEntryRepository
import java.time.Instant
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [WatchlistService] — focuses on the Phase 2 v2 validation gate that the autocomplete
 * adds upstream of the persistence layer. Persistence-level invariants (UNIQUE on `symbol`,
 * `addedAt` monotonic) live in the JPA contract and are exercised end-to-end via
 * `BackendApplicationTests` and the controller slice.
 *
 * What we pin :
 * - **Unknown symbol → IllegalArgumentException** (mapped to 400 by
 *   [com.portfolioai.shared.GlobalExceptionHandler]). Covers the `watchlist add XXXXX` regression
 *   we used to allow.
 * - **Idempotent path bypasses validation** — a symbol already on the list is returned without
 *   asking the search service. Two reasons : (1) it was valid at insertion time, no need to
 *   re-check ; (2) saves a Twelve Data credit on every duplicate add.
 * - **Normalisation happens before validation** — a lowercase `aapl` is uppercased to `AAPL` first,
 *   then validation runs on the normalised value. The whole flow goes through.
 * - **Blank / over-length input fails fast** before even hitting the repository or the search.
 */
class WatchlistServiceTest {

  private val repository: WatchlistEntryRepository = mock()
  private val symbolSearch: SymbolSearchService = mock()
  private val service = WatchlistService(repository, symbolSearch)

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `add normalises uppercase trim, validates, then persists`() {
    given(symbolSearch.validate(eq("AAPL"))).willReturn(true)
    given(repository.findBySymbol(eq("AAPL"))).willReturn(null)
    given(repository.save(any<WatchlistEntry>())).willAnswer { invocation ->
      invocation.arguments[0] as WatchlistEntry
    }

    val saved = service.add("  aapl ")

    assertEquals("AAPL", saved.symbol)
    verify(symbolSearch).validate("AAPL")
    verify(repository).save(any())
  }

  // ---------------------------------------------------------------------- validation gate

  @Test
  fun `add throws IllegalArgumentException when the symbol is not recognised`() {
    // The user typed something the configured market provider doesn't know — `XXXXX`, a typo,
    // a paid-tier-only ticker. Reject at the boundary so we never accumulate dead entries that
    // would 404 every time the user opens the dossier.
    given(symbolSearch.validate(eq("XXXXX"))).willReturn(false)
    given(repository.findBySymbol(eq("XXXXX"))).willReturn(null)

    val ex = assertThrows<IllegalArgumentException> { service.add("XXXXX") }

    assertTrue(ex.message?.contains("not recognised") ?: false)
    verify(repository, never()).save(any())
  }

  @Test
  fun `add fails open when the symbol search provider is unreachable`() {
    // Defends a clear UX rule : a flaky upstream (rate-limited / unreachable) must not block adds
    // for valid symbols. The autocomplete dropdown the user just picked from already had this
    // symbol in it — re-validating now is best-effort, not a hard gate. We log and accept rather
    // than surface a misleading 503 from `POST /api/watchlist`. See class-level note in
    // [WatchlistService].
    given(symbolSearch.validate(eq("AAPL"))).willAnswer {
      throw MarketUnavailableException("rate-limited")
    }
    given(repository.findBySymbol(eq("AAPL"))).willReturn(null)
    given(repository.save(any<WatchlistEntry>())).willAnswer { invocation ->
      invocation.arguments[0] as WatchlistEntry
    }

    val saved = service.add("AAPL")

    assertEquals("AAPL", saved.symbol)
    verify(repository).save(any())
  }

  @Test
  fun `add returning the existing entry skips validation`() {
    // Idempotent path — the symbol is already on the list. We trust the insertion-time validation
    // and don't burn another Twelve Data credit. Important : `validate` should never be called.
    val existing = WatchlistEntry(symbol = "NVDA", addedAt = Instant.parse("2026-04-01T10:00:00Z"))
    given(repository.findBySymbol(eq("NVDA"))).willReturn(existing)

    val returned = service.add("NVDA")

    assertEquals(existing, returned)
    verify(symbolSearch, never()).validate(any())
    verify(repository, never()).save(any())
  }

  // ---------------------------------------------------------------------- input guards

  @Test
  fun `add rejects blank input before reaching the search service`() {
    val ex = assertThrows<IllegalArgumentException> { service.add("   ") }

    assertTrue(ex.message?.contains("blank") ?: false)
    verify(symbolSearch, never()).validate(any())
    verify(repository, never()).save(any())
  }

  @Test
  fun `add rejects over-length symbols before reaching the search service`() {
    val ex = assertThrows<IllegalArgumentException> { service.add("A".repeat(21)) }

    assertTrue(ex.message?.contains("20 characters") ?: false)
    verify(symbolSearch, never()).validate(any())
    verify(repository, never()).save(any())
  }
}
