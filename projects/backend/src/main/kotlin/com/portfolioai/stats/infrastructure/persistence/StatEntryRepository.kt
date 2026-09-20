package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor

/**
 * Multi-tenant on `user.id` (FK to `app_user`) since #187 — there is no shared community dataset
 * any more, so every read scopes on the current user.
 *
 * The listing and the KPIs go through [JpaSpecificationExecutor] + [StatEntrySpecifications]
 * (scope + filters) ; [findByUserId] backs the CSV export, [findByUserIdAndTradeDateAndTicker] the
 * 409 on a duplicate (day, ticker), and [findByIdAndUserId] the user-scoped fetch behind edit and
 * delete (a foreign row never matches, so it can't be touched).
 */
interface StatEntryRepository :
  JpaRepository<StatEntry, UUID>, JpaSpecificationExecutor<StatEntry> {

  fun findByUserId(userId: UUID, sort: Sort): List<StatEntry>

  /** Natural-key lookup : one stat per (user, day, ticker). */
  fun findByUserIdAndTradeDateAndTicker(
    userId: UUID,
    tradeDate: LocalDate,
    ticker: String,
  ): StatEntry?

  fun findByIdAndUserId(id: UUID, userId: UUID): StatEntry?

  /** Backs the "in stats" flag of the candidates listing — one query for a whole day. */
  fun findByUserIdAndCandidateIdIn(userId: UUID, candidateIds: Collection<UUID>): List<StatEntry>
}
