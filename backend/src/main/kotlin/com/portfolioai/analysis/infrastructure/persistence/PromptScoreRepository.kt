package com.portfolioai.analysis.infrastructure.persistence

import com.portfolioai.analysis.domain.PromptScore
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

/**
 * Spring Data JPA repository for `prompt_score`. PR1 ships the table + entity ; PR2 the write at
 * the end of every narrative run via [com.portfolioai.analysis.application.PromptScoreRecorder] ;
 * PR5 adds the thumbs lookup keyed by `snapshot_id`. PR6 will layer aggregation queries grouped by
 * `prompt_template_id` for the stats page.
 *
 * Not a port in the hexagonal sense — `JpaRepository` is framework-tied by design (see B1 dette
 * 2026-05-15 ; outbound ports live in `<context>/domain/`, JPA repositories stay in
 * `infrastructure/persistence/`).
 */
interface PromptScoreRepository : JpaRepository<PromptScore, UUID> {
  /**
   * Returns the score row for the given narrative snapshot, or null when none exists. There is at
   * most one row per snapshot in the normal flow ([PromptScoreRecorder] writes exactly one per
   * run). The fallback prompt path skips the write, so a snapshot generated under it has no row —
   * the PR5 thumbs endpoint surfaces that as a 404.
   */
  fun findFirstBySnapshotId(snapshotId: UUID): PromptScore?
}
