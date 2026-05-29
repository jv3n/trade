package com.portfolioai.screener.infrastructure.persistence

import com.portfolioai.screener.domain.ScreenerSnapshotDay
import com.portfolioai.screener.domain.ScreenerSnapshotDayId
import java.time.LocalDate
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Spring Data JPA repository over [ScreenerSnapshotDay]. Composite key `(date, provider)` → the id
 * type is [ScreenerSnapshotDayId] (`@IdClass` on the entity).
 *
 * `save()` doubles as UPSERT — Spring Data merges if the row exists, persists otherwise — so the
 * service just rebuilds a [ScreenerSnapshotDay] with the new `fetched_at` + payload on every
 * refresh call and saves it.
 */
interface ScreenerSnapshotRepository : JpaRepository<ScreenerSnapshotDay, ScreenerSnapshotDayId> {

  /**
   * Latest persisted snapshot for [provider] — read path used when the UI opens the radar without a
   * `?date=` parameter. Returns `null` when the user has never pressed « Rechercher » for this
   * provider (the UI then renders the « clique sur Rechercher pour amorcer » empty state).
   */
  fun findFirstByProviderOrderByDateDesc(provider: String): ScreenerSnapshotDay?

  /** Explicit `(date, provider)` read — used when the UI passes `?date=YYYY-MM-DD`. */
  fun findByDateAndProvider(date: LocalDate, provider: String): ScreenerSnapshotDay?
}
