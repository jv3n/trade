package com.portfolioai.watchlist.domain

import com.portfolioai.auth.domain.User
import com.portfolioai.market.domain.InstrumentType
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * One ticker the user wants to track without owning it. Maps 1:1 to `watchlist_entry` (V3, V7 added
 * [instrumentType], V10 added [user] for multi-tenancy).
 *
 * Since V10 (Phase 4 — 2026-05-17), the table is **user-scoped** : the UNIQUE constraint moved from
 * `(symbol)` to `(user_id, symbol)`, so two distinct users can both watch AAPL without conflict.
 * The service still normalises the symbol (uppercase + trim) before insert so the constraint
 * catches `AAPL` vs `aapl` from the same user. The `user_id` is set from
 * `AuthService.getCurrentUser` in `WatchlistService.add` and propagated by ON DELETE CASCADE if the
 * user row is ever removed.
 *
 * [instrumentType] is the market-domain classification (`STOCK / ETF / INDEX / OTHER`) snapshotted
 * at the time of the POST add. Persisting at add-time lets the dashboard render the type chip
 * directly from the DTO instead of firing a parallel `getTicker(symbol)` per entry at mount — the
 * previous lazy-lookup design burned 2 Twelve Data credits per chip and burst-banned the free tier
 * on a watchlist of 5+ entries (cf. `journal-livraisons.md > Phase 2.5`). Nullable because the
 * lookup can fail (rate-limit, transient unreachable) and we'd rather store the row without the
 * type than block the user — same fail-open posture as [symbol] validation.
 */
@Entity
@Table(name = "watchlist_entry")
class WatchlistEntry(
  @Id val id: UUID = UUID.randomUUID(),
  @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false) val user: User,
  @Column(nullable = false, length = 20) var symbol: String,
  @Column(name = "added_at", nullable = false, updatable = false)
  val addedAt: Instant = Instant.now(),
  @Enumerated(EnumType.STRING)
  @Column(name = "instrument_type", length = 20)
  var instrumentType: InstrumentType? = null,
)
