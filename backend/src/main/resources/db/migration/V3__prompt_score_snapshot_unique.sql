-- =============================================================================
-- V3 — Unique constraint on prompt_score(snapshot_id) (2026-05-25)
-- =============================================================================
-- Closes the « setThumbs race théorique » sub-item of the post-livraison Phase 3
-- punch list. The `PromptScoreService.setThumbs` upsert path does a
-- `findFirstBySnapshotId == null` check then inserts ; two concurrent PATCHes
-- on the same snapshot can both pass the check and land 2 rows. Academic on a
-- single-user app, but a unique index closes the hole at the storage layer so
-- the invariant doesn't depend on transaction isolation tricks.
--
-- **Partial uniqueness** : `WHERE snapshot_id IS NOT NULL`. The column stays
-- nullable on purpose — a definitively failed run (parser + validator both KO)
-- persists its score (latency, retry_count, flags) without a snapshot FK. We
-- need to allow multiple null rows ; only the non-null IDs must be unique.
-- =============================================================================

-- Defensive dedupe BEFORE creating the constraint. Keeps the newest row per
-- snapshot_id (the one with the most recent `created_at`). On a fresh DB this
-- is a no-op ; on a DB where the race actually fired (single-user, near-zero
-- probability) it preserves the most recent thumbs / metrics the user saw.
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY snapshot_id
            ORDER BY created_at DESC, id DESC
        ) AS row_rank
    FROM prompt_score
    WHERE snapshot_id IS NOT NULL
)
DELETE FROM prompt_score
WHERE id IN (SELECT id FROM duplicates WHERE row_rank > 1);

-- The non-unique index served the same lookup ; the partial unique index below
-- covers it (Postgres uses a unique index for lookups just like a regular one)
-- so we drop the redundant one.
DROP INDEX IF EXISTS idx_prompt_score_snapshot;

CREATE UNIQUE INDEX idx_prompt_score_snapshot_unique
    ON prompt_score(snapshot_id)
    WHERE snapshot_id IS NOT NULL;
