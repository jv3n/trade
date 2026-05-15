package com.portfolioai.watchlist.application

import com.portfolioai.market.application.SymbolSearchService
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.InstrumentType
import com.portfolioai.market.domain.OhlcBar
import com.portfolioai.market.domain.TickerQuote
import com.portfolioai.market.domain.TickerSnapshot
import com.portfolioai.shared.UpstreamUnavailableException
import com.portfolioai.watchlist.domain.WatchlistEntry
import com.portfolioai.watchlist.infrastructure.persistence.WatchlistEntryRepository
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.inOrder
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

/**
 * Tests on [WatchlistService] — focuses on the Phase 2 v2 validation gate that the autocomplete
 * adds upstream of the persistence layer, and the V7 (2026-05-09) `instrumentType` snapshot at POST
 * add. Persistence-level invariants (UNIQUE on `symbol`, `addedAt` monotonic) live in the JPA
 * contract and are exercised end-to-end via `BackendApplicationTests` and the controller slice.
 *
 * What we pin :
 * - **Unknown symbol → IllegalArgumentException** (mapped to 400 by
 *   [com.portfolioai.shared.GlobalExceptionHandler]). Covers the `watchlist add XXXXX` regression
 *   we used to allow.
 * - **Idempotent path bypasses validation + lookup** — a symbol already on the list is returned
 *   without asking the search service or the chart service. Two reasons : (1) it was valid at
 *   insertion time, no need to re-check ; (2) saves both a `/symbol_search` and a `fetchChart`
 *   credit on every duplicate add.
 * - **Normalisation happens before validation** — a lowercase `aapl` is uppercased to `AAPL` first,
 *   then validation runs on the normalised value. The whole flow goes through.
 * - **Blank / over-length input fails fast** before even hitting the repository or the search.
 * - **`instrumentType` lookup at add** — the new entry carries the value returned by
 *   [TickerService.load] so the dashboard renders the chip directly from the DTO without firing a
 *   parallel `getTicker(symbol)` per entry on every mount (the previous lazy-lookup design that
 *   burst-banned Twelve Data on a watchlist of 5+ entries with a cold cache).
 * - **`instrumentType` fail-open** — any exception from the chart provider (rate-limit, 404,
 *   unreachable) yields `instrumentType = null` rather than blocking the add. Better an entry
 *   without a chip than a 503 on a symbol the autocomplete just confirmed.
 * - **Network calls happen before the persistence call** — audit 2026-05-10 finding #2. The service
 *   is no longer `@Transactional` on `add` ; the contract is that `symbolSearch.validate` and
 *   `tickerService.load` resolve before any `repository.save`, so a slow Twelve Data round-trip
 *   never holds the Hikari connection that the save eventually opens. We pin the order with Mockito
 *   `inOrder` rather than transaction-state instrumentation — coarse but sufficient as a regression
 *   guard against someone re-introducing `@Transactional` over the whole method.
 * - **TOCTOU re-check at write time** — moving the network calls outside the transaction opens a
 *   small window where a concurrent caller could insert the same symbol. We re-look-up
 *   `findBySymbol` inside the persistence helper so the duplicate path returns the existing row
 *   rather than letting the DB UNIQUE constraint surface as an integrity violation to the caller.
 */
class WatchlistServiceTest {

  private val repository: WatchlistEntryRepository = mock()
  private val symbolSearch: SymbolSearchService = mock()
  private val tickerService: TickerService = mock()
  private val service = WatchlistService(repository, symbolSearch, tickerService)

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `add normalises uppercase trim, validates, snapshots instrumentType, then persists`() {
    given(symbolSearch.validate(eq("AAPL"))).willReturn(true)
    given(repository.findBySymbol(eq("AAPL"))).willReturn(null)
    given(tickerService.load(eq("AAPL"))).willReturn(snapshot("AAPL", InstrumentType.STOCK))
    given(repository.save(any<WatchlistEntry>())).willAnswer { invocation ->
      invocation.arguments[0] as WatchlistEntry
    }

    val saved = service.add("  aapl ")

    assertEquals("AAPL", saved.symbol)
    assertEquals(InstrumentType.STOCK, saved.instrumentType)
    // Pin the call order : both network round-trips must resolve before the save happens. This is
    // the regression guard for audit 2026-05-10 finding #2 — if someone wraps `add` back in
    // `@Transactional`, the order itself doesn't break, but the intent does. The class-level
    // docstring on `WatchlistService` is the contract this assertion is pinning.
    inOrder(symbolSearch, tickerService, repository).also {
      it.verify(symbolSearch).validate("AAPL")
      it.verify(tickerService).load("AAPL")
      it.verify(repository).save(any())
    }
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
    // The instrumentType lookup is downstream of validation — never reached when validation
    // fails, so the credit budget is preserved on the rejected path.
    verify(tickerService, never()).load(any())
  }

  @Test
  fun `add fails open when the symbol search provider is unreachable`() {
    // Defends a clear UX rule : a flaky upstream (rate-limited / unreachable) must not block adds
    // for valid symbols. The autocomplete dropdown the user just picked from already had this
    // symbol in it — re-validating now is best-effort, not a hard gate. We log and accept rather
    // than surface a misleading 503 from `POST /api/watchlist`. See class-level note in
    // [WatchlistService].
    given(symbolSearch.validate(eq("AAPL"))).willAnswer {
      throw UpstreamUnavailableException("rate-limited")
    }
    given(repository.findBySymbol(eq("AAPL"))).willReturn(null)
    given(tickerService.load(eq("AAPL"))).willReturn(snapshot("AAPL", InstrumentType.STOCK))
    given(repository.save(any<WatchlistEntry>())).willAnswer { invocation ->
      invocation.arguments[0] as WatchlistEntry
    }

    val saved = service.add("AAPL")

    assertEquals("AAPL", saved.symbol)
    verify(repository).save(any())
  }

  @Test
  fun `add returning the existing entry skips validation and instrumentType lookup`() {
    // Idempotent path — the symbol is already on the list. We trust the insertion-time validation
    // and don't burn another Twelve Data credit. Important : neither `validate` nor
    // `tickerService.load` should be called.
    val existing =
      WatchlistEntry(
        symbol = "NVDA",
        addedAt = Instant.parse("2026-04-01T10:00:00Z"),
        instrumentType = InstrumentType.STOCK,
      )
    given(repository.findBySymbol(eq("NVDA"))).willReturn(existing)

    val returned = service.add("NVDA")

    assertEquals(existing, returned)
    verify(symbolSearch, never()).validate(any())
    verify(tickerService, never()).load(any())
    verify(repository, never()).save(any())
  }

  // ---------------------------------------------------------------------- instrumentType lookup

  @Test
  fun `add stores instrumentType=null when the chart provider rate-limits the lookup`() {
    // Critical fail-open path : the autocomplete just validated the symbol, but in the same
    // 100 ms window the chart endpoint hits a rate-limit. The user has already paid for the
    // happy validation path — refusing to save here would be a regression vs the symbol-search
    // fail-open. We persist with null so the row exists and the dashboard skips the chip
    // (degrade closed). Subsequent dossier opens will populate the cache and a future re-add
    // could backfill the type if we ever care.
    given(symbolSearch.validate(eq("AAPL"))).willReturn(true)
    given(repository.findBySymbol(eq("AAPL"))).willReturn(null)
    given(tickerService.load(eq("AAPL"))).willAnswer {
      throw UpstreamUnavailableException("rate-limited")
    }
    given(repository.save(any<WatchlistEntry>())).willAnswer { invocation ->
      invocation.arguments[0] as WatchlistEntry
    }

    val saved = service.add("AAPL")

    assertEquals("AAPL", saved.symbol)
    assertNull(saved.instrumentType)
    verify(repository).save(any())
  }

  @Test
  fun `add stores instrumentType=null when the upstream returns no quote`() {
    // Twelve Data has been observed returning an empty quote on free tier for some thinly-traded
    // tickers — the symbol is real (validates), but `instrumentType` is null on the snapshot.
    // No exception, just a null. The row is saved with that null and the chip absent.
    given(symbolSearch.validate(eq("OBSCURE"))).willReturn(true)
    given(repository.findBySymbol(eq("OBSCURE"))).willReturn(null)
    given(tickerService.load(eq("OBSCURE"))).willReturn(snapshot("OBSCURE", instrumentType = null))
    given(repository.save(any<WatchlistEntry>())).willAnswer { invocation ->
      invocation.arguments[0] as WatchlistEntry
    }

    val saved = service.add("OBSCURE")

    assertNull(saved.instrumentType)
  }

  // ---------------------------------------------------------------------- TOCTOU re-check

  @Test
  fun `add returns the existing entry when a concurrent insert lands during the network calls`() {
    // Simulates the race window opened by moving the network calls outside the transaction
    // (audit 2026-05-10 finding #2). The first `findBySymbol` returns null (nothing on the list
    // yet), the network calls run, and by the time we re-check inside the persistence helper a
    // concurrent caller has already inserted the same symbol. We must return that existing row
    // rather than `save` again — both because the DB UNIQUE constraint would 500 the request, and
    // because the user's intent ("watch AAPL") is satisfied either way.
    val concurrent =
      WatchlistEntry(
        symbol = "AAPL",
        addedAt = Instant.parse("2026-05-10T11:59:59Z"),
        instrumentType = InstrumentType.STOCK,
      )
    given(symbolSearch.validate(eq("AAPL"))).willReturn(true)
    // First call (pre-network) returns null ; second call (post-network re-check) returns the row
    // a concurrent caller just inserted. Mockito-kotlin's varargs `willReturn` walks the sequence.
    given(repository.findBySymbol(eq("AAPL"))).willReturn(null, concurrent)
    given(tickerService.load(eq("AAPL"))).willReturn(snapshot("AAPL", InstrumentType.STOCK))

    val returned = service.add("AAPL")

    assertSame(concurrent, returned)
    // Critical : the duplicate path must NOT issue a `save` — that's the whole point of the
    // re-check. The DB UNIQUE constraint is the safety net, not the primary guard.
    verify(repository, never()).save(any())
  }

  // ---------------------------------------------------------------------- input guards

  @Test
  fun `add rejects blank input before reaching the search service`() {
    val ex = assertThrows<IllegalArgumentException> { service.add("   ") }

    assertTrue(ex.message?.contains("blank") ?: false)
    verify(symbolSearch, never()).validate(any())
    verify(tickerService, never()).load(any())
    verify(repository, never()).save(any())
  }

  @Test
  fun `add rejects over-length symbols before reaching the search service`() {
    val ex = assertThrows<IllegalArgumentException> { service.add("A".repeat(21)) }

    assertTrue(ex.message?.contains("20 characters") ?: false)
    verify(symbolSearch, never()).validate(any())
    verify(tickerService, never()).load(any())
    verify(repository, never()).save(any())
  }

  // ---------------------------------------------------------------------- helpers

  private fun snapshot(symbol: String, instrumentType: InstrumentType?): TickerSnapshot =
    TickerSnapshot(
      quote =
        TickerQuote(
          symbol = symbol,
          name = "$symbol Inc.",
          currency = "USD",
          exchange = "NASDAQ",
          price = BigDecimal("100.00"),
          fiftyTwoWeekHigh = BigDecimal("120.00"),
          fiftyTwoWeekLow = BigDecimal("80.00"),
          asOf = Instant.parse("2026-05-09T12:00:00Z"),
          instrumentType = instrumentType,
        ),
      bars = emptyList<OhlcBar>(),
      indicators = null,
    )
}
