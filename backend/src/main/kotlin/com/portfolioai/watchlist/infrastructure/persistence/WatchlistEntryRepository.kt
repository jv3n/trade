package com.portfolioai.watchlist.infrastructure.persistence

import com.portfolioai.watchlist.domain.WatchlistEntry
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Toutes les méthodes scopées par `user_id` depuis V10 (cf.
 * `db/migration/V10__user_scoped_portfolio_watchlist.sql`). La contrainte UNIQUE sur `(user_id,
 * symbol)` permet à deux users distincts d'avoir AAPL chacun ; la table reste
 * single-row-per-user-per-symbol.
 */
interface WatchlistEntryRepository : JpaRepository<WatchlistEntry, UUID> {

  fun findByUserIdAndSymbol(userId: UUID, symbol: String): WatchlistEntry?

  fun findAllByUserIdOrderByAddedAtAsc(userId: UUID): List<WatchlistEntry>

  fun deleteByUserIdAndSymbol(userId: UUID, symbol: String): Long
}
