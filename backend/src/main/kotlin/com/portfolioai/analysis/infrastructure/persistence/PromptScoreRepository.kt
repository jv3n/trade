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
   * Returns the score row for the given narrative snapshot, or null when none exists. Uniqueness is
   * DB-enforced since V3 (partial unique index on `snapshot_id` WHERE NOT NULL — see
   * `V3__prompt_score_snapshot_unique.sql`) ; before V3 it was an implicit invariant that the
   * `setThumbs` upsert path could theoretically violate under concurrent PATCHes. The fallback
   * prompt path skips the write, so a snapshot generated under it has no row — the PR5 thumbs
   * endpoint creates it on demand or surfaces a 404 when the snapshot itself is missing.
   */
  fun findFirstBySnapshotId(snapshotId: UUID): PromptScore?
}
