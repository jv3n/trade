package com.portfolioai.watchlist.application

import com.portfolioai.market.application.SymbolSearchService
import com.portfolioai.market.domain.MarketUnavailableException
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
 * (`MarketUnavailableException` from a rate-limited or unreachable upstream), we accept the add
 * rather than block the user with a 503 from an unrelated outage. Reasoning : the symbol may be
 * perfectly valid, the user just had the bad luck of clicking Add during a transient blip, and
 * forcing them to retry minutes later against a flaky upstream is a worse experience than storing
 * one unverified row that the autocomplete has already confirmed at type time anyway. The
 * autocomplete dropdown collapses to `[]` on the same exception, so the user can only reach this
 * code path via a UI that just showed them the symbol existed.
 */
@Service
class WatchlistService(
  private val repository: WatchlistEntryRepository,
  private val symbolSearch: SymbolSearchService,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  fun list(): List<WatchlistEntry> = repository.findAllByOrderByAddedAtAsc()

  @Transactional
  fun add(symbol: String): WatchlistEntry {
    val normalised = normalise(symbol)
    require(normalised.isNotEmpty()) { "Watchlist symbol cannot be blank" }
    require(normalised.length <= 20) { "Watchlist symbol exceeds 20 characters: $normalised" }
    repository.findBySymbol(normalised)?.let {
      return it
    }
    require(isKnownSymbol(normalised)) {
      "Symbol '$normalised' is not recognised by the configured market provider"
    }
    return repository.save(WatchlistEntry(symbol = normalised))
  }

  /**
   * Wraps [SymbolSearchService.validate] with a fail-open guard against transient provider outages
   * — see the class-level note for the rationale.
   */
  private fun isKnownSymbol(symbol: String): Boolean =
    try {
      symbolSearch.validate(symbol)
    } catch (e: MarketUnavailableException) {
      log.warn(
        "Skipping watchlist symbol validation for '{}' — provider unavailable: {}",
        symbol,
        e.message,
      )
      true
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
