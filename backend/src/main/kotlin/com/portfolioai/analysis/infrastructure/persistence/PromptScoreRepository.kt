package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.PromptScore
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Persistence port for `prompt_score`. PR1 ships only the table + entity ; PR2 wires the write
 * inside `TickerNarrativeRunner`, PR5 will add the thumbs update via a custom `@Modifying` query
 * keyed by `snapshot_id`, and PR6 the aggregations grouped by `prompt_template_id` for the stats
 * page. Empty interface today on purpose — the surface lands when each PR consumes it.
 */
interface PromptScoreRepository : JpaRepository<PromptScore, UUID>
