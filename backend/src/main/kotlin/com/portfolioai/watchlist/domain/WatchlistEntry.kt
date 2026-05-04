package com.portfolioai.watchlist.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * One ticker the user wants to track without owning it. Maps 1:1 to `watchlist_entry` (V3).
 *
 * No portfolio link, no user link — the watchlist is a flat global list at this stage of the
 * project (single-user app). The `symbol` column has a UNIQUE constraint so the database is the
 * source of truth for "this ticker is on the list once" ; the service still normalises the symbol
 * (uppercase + trim) before insert to keep the constraint useful (`AAPL` vs `aapl` would otherwise
 * produce two rows).
 */
@Entity
@Table(name = "watchlist_entry")
class WatchlistEntry(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(nullable = false, length = 20, unique = true) var symbol: String,
  @Column(name = "added_at", nullable = false, updatable = false)
  val addedAt: Instant = Instant.now(),
)
