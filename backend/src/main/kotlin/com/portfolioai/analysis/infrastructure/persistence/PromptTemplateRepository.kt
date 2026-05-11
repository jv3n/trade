package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.PromptTemplate
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface PromptTemplateRepository : JpaRepository<PromptTemplate, UUID> {
  /**
   * Returns the currently active prompt for [name] (e.g. `"narrative-default"`). The DB
   * partial-unique index `idx_prompt_template_active_per_name` guarantees at most one row matches —
   * Spring Data's `findFirst` keeps us safe even if a manual SQL write breaks the invariant.
   *
   * Returns null when no row is active for [name] : that's the bootstrap case (Flyway V8 hasn't run
   * yet, or the seed was deleted manually). The service layer falls back to the hardcoded constant
   * in that path.
   */
  fun findFirstByNameAndIsActiveTrue(name: String): PromptTemplate?

  fun findAllByNameOrderByCreatedAtDesc(name: String): List<PromptTemplate>
}
