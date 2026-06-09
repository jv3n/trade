package com.portfolioai.lexicon.infrastructure.persistence

import com.portfolioai.lexicon.domain.LexiconEntry
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * **Global, shared dataset** — no `user_id`, no per-user scoping. The derived
 * `existsByTermIgnoreCase*` queries back the service's case-insensitive uniqueness pre-check (the
 * DB unique index on `lower(term)` is the hard backstop). Listing uses the inherited
 * `findAll(Sort)`.
 */
interface LexiconEntryRepository : JpaRepository<LexiconEntry, UUID> {
  fun existsByTermIgnoreCase(term: String): Boolean

  fun existsByTermIgnoreCaseAndIdNot(term: String, id: UUID): Boolean
}
