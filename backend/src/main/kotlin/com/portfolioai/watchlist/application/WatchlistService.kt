package com.portfolioai.watchlist.application

import com.portfolioai.market.application.SymbolSearchService
import com.portfolioai.market.application.TickerService
import com.portfolioai.market.domain.InstrumentType
import com.portfolioai.shared.UpstreamUnavailableException
import com.portfolioai.watchlist.domain.WatchlistEntry
import com.portfolioai.watchlist.infrastructure.persistence.WatchlistEntryRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Use-case service for the watchlist. Three operations : list, add (idempotent), remove.
 *
 * **Symbol normalisation** — every public method runs the input through [normalise] (`uppercase` +
 * `trim`). Without this `AAPL` and `aapl` would produce two rows despite the UNIQUE constraint
 * being case-sensitive on PostgreSQL. The dossier endpoint already uppercases, the chart endpoint
 * already uppercases — the watchlist follows the same convention so the three are consistent.
 *
 * **Idempotent add** — POSTing a symbol that's already on the list returns the existing entry
 * rather than throwing. Callers (front, integration scripts) don't have to check first ; the API
 * stays simple.
 *
 * **Validation gate (Phase 2 v2)** — before saving, [add] asks [SymbolSearchService.validate] that
 * the configured market provider actually knows the symbol. A symbol the provider doesn't recognise
 * would never produce an exploitable dossier (chart fetch would 404, narrative would never run), so
 * we'd rather reject early at the watchlist boundary with a clear 400 than let the user accumulate
 * dead entries. Existing rows on the list (idempotent path) are returned without re-validation —
 * they were valid at insertion time.
 *
 * **Fail-open on provider hiccup** — if the validation call itself fails
 * (`UpstreamUnavailableException` from a rate-limited or unreachable upstream), we accept the add
 * rather than block the user with a 503 from an unrelated outage. Reasoning : the symbol may be
 * perfectly valid, the user just had the bad luck of clicking Add during a transient blip, and
 * forcing them to retry minutes later against a flaky upstream is a worse experience than storing
 * one unverified row that the autocomplete has already confirmed at type time anyway. The
 * autocomplete dropdown collapses to `[]` on the same exception, so the user can only reach this
 * code path via a UI that just showed them the symbol existed.
 *
 * **`instrumentType` snapshot (V7, 2026-05-09)** — [add] also calls [TickerService.load] to grab
 * the market-domain `InstrumentType` for the chip the dashboard renders next to each watchlist row.
 * Same fail-open posture as the symbol validation : if the lookup fails (rate-limit, 404, provider
 * unreachable), the entry is still created with `instrumentType = null`. Replaces the previous
 * lazy-lookup design (`Dashboard.enrichWatchlistInstrumentTypes`) that fired a `getTicker(symbol)`
 * parallel per entry on every dashboard mount — burst-banned the Twelve Data free tier (8
 * calls/min) on a watchlist of 5+ entries with a cold cache. See `journal-livraisons.md > Phase
 * 2.5` for the full friction trail.
 *
 * **Network calls outside the transaction (audit 2026-05-10 finding #2)** — [add] is deliberately
 * NOT `@Transactional`. The two upstream calls ([SymbolSearchService.validate] and
 * [TickerService.load]) can each take 1-3 s on a Twelve Data cache miss (more on a timeout) ;
 * holding a Hikari connection for that whole window violates the project invariant documented in
 * `architecture.md` ("LLM/network call hors transaction"). Spring Data's `save()` opens its own
 * short transaction so the actual write is still atomic. There is a TOCTOU window between the
 * pre-flight `findBySymbol` and the post-network `findBySymbol` re-check inside [persistNew] — the
 * DB UNIQUE constraint on `symbol` is the safety net, and we re-look one last time inside the write
 * so the duplicate path returns the existing row rather than surfacing an integrity violation to
 * the caller. Single-user low-concurrency makes the window vanishingly small ; the structure stays
 * correct under Phase 5 multi-user.
 */
@Service
class WatchlistService(
  private val repository: WatchlistEntryRepository,
  private val symbolSearch: SymbolSearchService,
  private val tickerService: TickerService,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun list(): List<WatchlistEntry> = repository.findAllByOrderByAddedAtAsc()

  fun add(symbol: String): WatchlistEntry {
    val normalised = normalise(symbol)
    require(normalised.isNotEmpty()) { "Watchlist symbol cannot be blank" }
    require(normalised.length <= 20) { "Watchlist symbol exceeds 20 characters: $normalised" }
    repository.findBySymbol(normalised)?.let {
      return it
    }
    // Network calls happen here — outside any transaction the service opens. See class-level note.
    require(isKnownSymbol(normalised)) {
      "Symbol '$normalised' is not recognised by the configured market provider"
    }
    val instrumentType = lookupInstrumentType(normalised)
    return persistNew(normalised, instrumentType)
  }

  /**
   * Persistence-only step of [add]. Spring Data's `save()` is implicitly `@Transactional`, so this
   * helper opens a short transaction just for the write. The post-network re-check on
   * `findBySymbol` covers the TOCTOU window opened by moving the upstream calls outside the
   * transaction — if a concurrent caller inserted the same symbol while we were on the wire, we
   * return the existing row.
   */
  private fun persistNew(symbol: String, instrumentType: InstrumentType?): WatchlistEntry {
    repository.findBySymbol(symbol)?.let {
      return it
    }
    return repository.save(WatchlistEntry(symbol = symbol, instrumentType = instrumentType))
  }

  /**
   * Wraps [SymbolSearchService.validate] with a fail-open guard against transient provider outages
   * — see the class-level note for the rationale.
   */
  private fun isKnownSymbol(symbol: String): Boolean =
    try {
      symbolSearch.validate(symbol)
    } catch (e: UpstreamUnavailableException) {
      log.warn(
        "Skipping watchlist symbol validation for '{}' — provider unavailable: {}",
        symbol,
        e.message,
      )
      true
    }

  /**
   * Snapshot the [InstrumentType] for the chip the dashboard renders. Fail-open : any error from
   * upstream (`UpstreamUnavailableException` rate-limit / unreachable, [NoSuchElementException] on
   * a symbol the chart provider doesn't recognise even though autocomplete validated it, etc.)
   * yields `null`. The row is still saved — better an entry without a chip than a 503 because of a
   * transient provider blip on a symbol the user just saw in the autocomplete.
   */
  // The broad catch is the contract — any failure from the chart provider degrades the chip
  // rather than blocking the add. See the class-level note. Suppressing the lint here rather
  // than in `detekt.yml` so the intent stays at the call site.
  @Suppress("TooGenericExceptionCaught")
  private fun lookupInstrumentType(symbol: String): InstrumentType? =
    try {
      tickerService.load(symbol).quote.instrumentType
    } catch (e: Exception) {
      log.warn(
        "Skipping watchlist instrumentType lookup for '{}' — {}: {}",
        symbol,
        e.javaClass.simpleName,
        e.message,
      )
      null
    }

  @Transactional
  fun remove(symbol: String) {
    val normalised = normalise(symbol)
    val deleted = repository.deleteBySymbol(normalised)
    if (deleted == 0L) {
      throw NoSuchElementException("Watchlist entry not found: $normalised")
    }
  }

  private fun normalise(symbol: String): String = symbol.trim().uppercase()
}
