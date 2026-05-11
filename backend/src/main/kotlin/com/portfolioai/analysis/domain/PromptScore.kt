package com.portfolioai.analysis.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Per-run scoring row persisted in `prompt_score` (Flyway V8). One line is written by
 * `TickerNarrativeRunner` at the end of every narrative generation (Phase 3 PR2 wires the write —
 * PR1 only ships the schema + entity so the table exists once `mvn flyway:migrate` resolves).
 *
 * **Why we keep [snapshotId] nullable** — a run can fail on both attempts (parser KO twice or
 * validator KO twice) and end without a snapshot. We still want to keep the score row : it's the
 * only place where `parse_failed` / `validator_failed` flags live, and losing them would hide
 * exactly the cases that motivate prompt improvement work. [snapshotId] is therefore set on
 * success, left null on terminal failure.
 *
 * **`userThumbs` semantics** — Phase 3 PR5 adds the 👍/👎 button on the dossier ticker. The column
 * starts at `0` (no feedback) and flips to `-1` or `+1` when the user clicks. Re-clicks overwrite
 * (idempotent) so the row stays single-line per snapshot. `CHECK (-1, 0, 1)` enforced in V8 SQL —
 * the entity stores it as `Short` to mirror the SQL type.
 *
 * **`llmJudgeScore` reserved for Phase 3 future** — when we wire Claude to grade qwen's output,
 * this column carries the score. Range to be pinned at that time (today the migration just keeps it
 * nullable `NUMERIC(5,2)`).
 */
@Entity
@Table(name = "prompt_score")
class PromptScore(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(name = "snapshot_id") val snapshotId: UUID? = null,
  @Column(name = "prompt_template_id", nullable = false) val promptTemplateId: UUID,
  @Column(name = "latency_ms", nullable = false) val latencyMs: Int,
  @Column(name = "retry_count", nullable = false) val retryCount: Int = 0,
  @Column(name = "parse_failed", nullable = false) val parseFailed: Boolean = false,
  @Column(name = "validator_failed", nullable = false) val validatorFailed: Boolean = false,
  @Column(name = "user_thumbs", nullable = false) var userThumbs: Short = 0,
  @Column(name = "llm_judge_score") val llmJudgeScore: BigDecimal? = null,
  @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
)
