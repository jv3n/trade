package com.portfolioai.watchlist.application

import com.portfolioai.watchlist.domain.WatchlistEntry
import com.portfolioai.watchlist.infrastructure.persistence.WatchlistEntryRepository
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
 */
@Service
class WatchlistService(private val repository: WatchlistEntryRepository) {

  fun list(): List<WatchlistEntry> = repository.findAllByOrderByAddedAtAsc()

  @Transactional
  fun add(symbol: String): WatchlistEntry {
    val normalised = normalise(symbol)
    require(normalised.isNotEmpty()) { "Watchlist symbol cannot be blank" }
    require(normalised.length <= 20) { "Watchlist symbol exceeds 20 characters: $normalised" }
    return repository.findBySymbol(normalised)
      ?: repository.save(WatchlistEntry(symbol = normalised))
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
