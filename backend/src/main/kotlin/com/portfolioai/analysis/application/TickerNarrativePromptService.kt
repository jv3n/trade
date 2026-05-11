package com.portfolioai.analysis.application

import com.github.benmanes.caffeine.cache.Caffeine
import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.infrastructure.persistence.PromptTemplateRepository
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Source of truth for the active narrative prompt at runtime. Replaces the direct read of the
 * `NARRATIVE_SYSTEM_PROMPT` Kotlin constant from `TickerNarrativeExecutor` so the prompt can be
 * edited live from the future `/settings/prompts` page (Phase 3 PR3+PR4) without a redeploy.
 *
 * **Read path** — [activePrompt] looks up the row with `is_active = true` for the conventional
 * family name `narrative-default` (cf. backlog Phase 3 #1). The result is cached 1 minute via
 * Caffeine so a burst of narrative requests doesn't hit the DB N times. Cache TTL aligned with the
 * spec from the backlog ticket : « cache court (1 min) — switch live sans reboot » — short enough
 * that an "Activate" click on the future UI lands within the user's perception of "live" (a tab
 * refresh or two), long enough that the savings are real on a hot run loop.
 *
 * **Write-through invalidation** — when PR3 lands the activate endpoint, it will call [invalidate]
 * right after the DB flip so the next read picks up the new active row immediately (no need to wait
 * for the 1-minute timer). PR1 leaves the method exposed for that future use ; today no caller
 * invokes it, the cache just expires naturally.
 *
 * **Fallback contract** — if no active row is found in the DB (bootstrap : V8 hasn't run yet, or
 * the seed was wiped manually), the service falls back to a synthetic [PromptTemplate] backed by
 * the hardcoded `NARRATIVE_SYSTEM_PROMPT` constant. The fallback row carries `id =
 * FALLBACK_TEMPLATE_ID` (a fixed UUID, never persisted) so callers downstream
 * ([TickerNarrativePersister], [PromptScore] writes in PR2) can still record a non-null
 * `prompt_template_id` if they need to — but the persister checks against this sentinel and stores
 * `null` rather than inserting a foreign-key violation.
 *
 * **Phase 3 sub-PRs sharing this service** :
 * - PR1 (this) : read active + cache + fallback ; runner switches to use this.
 * - PR2 : `PromptScore` writer reads `activePrompt().id` to fill the FK on every run.
 * - PR3 : `/settings/prompts` v1 list/view/activate calls `invalidate()` post-activation.
 * - PR4 : edit + diff hits the same activate path (new version → activate → invalidate).
 * - PR5/PR6 : feedback loop + stats consume `prompt_score` joined on `prompt_template_id`.
 */
@Service
class TickerNarrativePromptService(private val repository: PromptTemplateRepository) {
  private val log = LoggerFactory.getLogger(javaClass)

  // Caffeine cache keyed by family name (today only `narrative-default`, but the structure is
  // ready for `portfolio-aggregator` Phase 4 etc.). expireAfterWrite chosen over expireAfterAccess
  // so a constantly-hit prompt is still refreshed every minute — important for the live-edit UX.
  private val cache =
    Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(1)).build<String, PromptTemplate>()

  /**
   * Returns the currently active prompt for the narrative pipeline. Falls back to the hardcoded
   * `NARRATIVE_SYSTEM_PROMPT` when the DB has no active row — see class-level note.
   */
  fun activePrompt(): PromptTemplate = lookupOrFallback(NARRATIVE_FAMILY)

  /** Cache invalidation hook for the activate path (PR3+). Cheap, idempotent. */
  fun invalidate(name: String = NARRATIVE_FAMILY) {
    cache.invalidate(name)
  }

  /**
   * `true` when [template] is the synthetic fallback that the service returns when the DB has no
   * active row. Callers persisting a `prompt_template_id` should treat this as "no FK to write"
   * (the sentinel UUID is never persisted to `prompt_template`).
   */
  fun isFallback(template: PromptTemplate): Boolean = template.id == FALLBACK_TEMPLATE_ID

  private fun lookupOrFallback(name: String): PromptTemplate {
    return cache.get(name) {
      val row = repository.findFirstByNameAndIsActiveTrue(name)
      if (row != null) {
        row
      } else {
        log.warn(
          "No active prompt_template for name={} — falling back to hardcoded NARRATIVE_SYSTEM_PROMPT. " +
            "Run Flyway migrations or seed the table to silence this.",
          name,
        )
        FALLBACK_TEMPLATE
      }
    }!!
  }

  companion object {
    const val NARRATIVE_FAMILY = "narrative-default"

    // Fixed sentinel UUID for the fallback row — never persisted, lets the persister detect it
    // and store null on the snapshot's `prompt_template_id` rather than inserting a row that
    // doesn't exist in `prompt_template`.
    private val FALLBACK_TEMPLATE_ID =
      java.util.UUID.fromString("00000000-0000-0000-0000-000000000001")

    // Constructed once at class init from the hardcoded constant. The version tag mirrors
    // `NARRATIVE_PROMPT_VERSION` so historical scripts that filter `prompt_version = 'v2'` still
    // work even if the bootstrap row never made it to the DB.
    private val FALLBACK_TEMPLATE =
      PromptTemplate(
        id = FALLBACK_TEMPLATE_ID,
        name = NARRATIVE_FAMILY,
        version = NARRATIVE_PROMPT_VERSION,
        systemPrompt = NARRATIVE_SYSTEM_PROMPT,
        isActive = true,
      )
  }
}
