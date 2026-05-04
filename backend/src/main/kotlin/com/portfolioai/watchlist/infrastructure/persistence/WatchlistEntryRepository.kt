package com.portfolioai.watchlist.infrastructure.persistence

import com.portfolioai.watchlist.domain.WatchlistEntry
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface WatchlistEntryRepository : JpaRepository<WatchlistEntry, UUID> {
  fun findBySymbol(symbol: String): WatchlistEntry?

  fun findAllByOrderByAddedAtAsc(): List<WatchlistEntry>

  fun deleteBySymbol(symbol: String): Long
}
