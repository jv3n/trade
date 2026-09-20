package com.portfolioai.journal.infrastructure.persistence

import com.portfolioai.journal.domain.TradeEntry
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor

/**
 * Multi-tenant on `user.id` (FK to `app_user`). All read methods scope on the current user — the
 * application layer never queries the table without a userId filter, and the controller resolves it
 * from the authenticated principal.
 *
 * Extends [JpaSpecificationExecutor] so the service layer can pass a dynamic [Specification] (see
 * [TradeEntrySpecifications.matching]) for filtered listings — required-where predicate (user
 * scope) + optional filters (search, date range, patterns, status).
 */
interface TradeEntryRepository :
  JpaRepository<TradeEntry, UUID>, JpaSpecificationExecutor<TradeEntry> {

  fun findByIdAndUserId(id: UUID, userId: UUID): TradeEntry?

  /**
   * The caller trades born from these stats — one per stat at most (unique index, #193). Backs the
   * link the stats listing shows in place of the « → Trade » button, in one query per page.
   */
  fun findByUserIdAndStatEntryIdIn(userId: UUID, statEntryIds: Collection<UUID>): List<TradeEntry>

  fun deleteByIdAndUserId(id: UUID, userId: UUID): Long
}
