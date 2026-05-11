package com.portfolioai.analysis.application

import com.portfolioai.analysis.application.dto.PromptStatsDto
import com.portfolioai.analysis.domain.PromptScore
import com.portfolioai.analysis.infrastructure.persistence.PromptScoreRepository
import com.portfolioai.analysis.infrastructure.persistence.PromptScoreStatsQuery
import com.portfolioai.analysis.infrastructure.persistence.TickerNarrativeSnapshotRepository
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Read + thumbs-update API on `prompt_score`. The init write at narrative generation time lives in
 * [PromptScoreRecorder] (kept separate so the runtime `finally` path stays focused on measurement).
 * This service hosts the user-facing operations :
 *
 * - **PR5 (today)** : [setThumbs] flips the persisted `user_thumbs` value when the user clicks
 *   👍/👎 on the dossier ticker. Idempotent : re-clicking the same value is a no-op write.
 * - **PR6 (future)** : aggregation queries grouped by `prompt_template_id` for the per-prompt stats
 *   page (latency p50/p95, retry rate, parse-failure rate, thumbs distribution).
 */
@Service
class PromptScoreService(
  private val repository: PromptScoreRepository,
  private val statsQuery: PromptScoreStatsQuery,
  private val snapshotRepository: TickerNarrativeSnapshotRepository,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  /**
   * Returns aggregated scoring stats for [promptTemplateId] (Phase 3 PR6). Empty when no
   * `prompt_score` row exists yet — the page renders an empty state pointing the user at the «
   * waiting for next narrative run » hint.
   */
  fun getStats(promptTemplateId: UUID): PromptStatsDto = statsQuery.aggregate(promptTemplateId)

  /**
   * Sets the `user_thumbs` value for the score row tied to [snapshotId]. The DB CHECK constraint
   * already restricts `user_thumbs IN (-1, 0, 1)` ; we re-validate here so the API surfaces a clean
   * 400 rather than letting the integrity violation bubble up.
   *
   * **Upsert semantics** — when no `prompt_score` row exists for the snapshot, we *create one* with
   * default metrics (latency / retry / flags zeroed) + the user's thumbs value, provided the
   * snapshot itself exists and carries a `prompt_template_id`. This covers two real-world paths :
   * (a) snapshots generated before PR2 wired the recorder, so their FK was set via the V8 backfill
   * but no score row was ever written ; (b) any future race where the snapshot lands but the
   * recorder fires fails silently. Without the upsert, the user would click 👍 and see a 404 they
   * have no way to recover from. The created row has `latency = 0` etc. which is honest (we don't
   * have measurements for runs the recorder didn't see).
   *
   * Throws [NoSuchElementException] only when the snapshot itself doesn't exist or has a null
   * `prompt_template_id` (genuine fallback path, no FK target to write).
   */
  @Transactional
  fun setThumbs(snapshotId: UUID, value: Short): PromptScore {
    require(value in ALLOWED_THUMBS) { "thumbs value must be -1, 0, or 1 (got $value)" }
    val existing = repository.findFirstBySnapshotId(snapshotId)
    if (existing != null) {
      existing.userThumbs = value
      val saved = repository.save(existing)
      log.info(
        "Updated prompt_score user_thumbs id={} snapshotId={} value={}",
        saved.id,
        snapshotId,
        value,
      )
      return saved
    }

    val snapshot =
      snapshotRepository.findById(snapshotId).orElseThrow {
        NoSuchElementException("No narrative snapshot for id $snapshotId")
      }
    val promptTemplateId =
      snapshot.promptTemplateId
        ?: throw NoSuchElementException(
          "Snapshot $snapshotId has no prompt_template_id (fallback prompt path) — cannot record feedback"
        )

    val fresh =
      PromptScore(
        snapshotId = snapshotId,
        promptTemplateId = promptTemplateId,
        latencyMs = 0,
        retryCount = 0,
        parseFailed = false,
        validatorFailed = false,
        userThumbs = value,
      )
    val saved = repository.save(fresh)
    log.info(
      "Created prompt_score from thumbs PATCH id={} snapshotId={} promptTemplateId={} value={}",
      saved.id,
      snapshotId,
      promptTemplateId,
      value,
    )
    return saved
  }

  companion object {
    private val ALLOWED_THUMBS = setOf((-1).toShort(), 0.toShort(), 1.toShort())
  }
}
