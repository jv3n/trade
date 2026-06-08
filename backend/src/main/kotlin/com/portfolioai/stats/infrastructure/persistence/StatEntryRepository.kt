package com.portfolioai.stats.infrastructure.persistence

import com.portfolioai.stats.domain.StatEntry
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Multi-tenant on `user.id` (FK to `app_user`). The import path is the only writer today ; reads
 * (listing / stats aggregation) land in phase 2. Kept minimal until then.
 */
interface StatEntryRepository : JpaRepository<StatEntry, UUID>
