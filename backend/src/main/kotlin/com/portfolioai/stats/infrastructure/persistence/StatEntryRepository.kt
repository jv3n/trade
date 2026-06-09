package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * **Global, shared dataset** — no `user_id`, no per-user scoping (unlike `TradeEntryRepository`).
 * Writes go through the ADMIN-gated CSV import ; reads are the paginated listing
 * ([JpaRepository.findAll] with a `Pageable`) and the whole-table export. Stats aggregation lands
 * in phase 2. The inherited `findAll(Pageable)` / `findAll(Sort)` cover today's needs, so this
 * stays a marker interface.
 */
interface StatEntryRepository : JpaRepository<StatEntry, UUID>
