package com.portfolioai.analysis.application

import com.github.benmanes.caffeine.cache.Caffeine
import com.portfolioai.analysis.application.dto.CreatePromptInput
import com.portfolioai.analysis.domain.PromptTemplate
import com.portfolioai.analysis.infrastructure.persistence.PromptTemplateRepository
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

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

  // -------------------------------------------------------------------- management API (PR3+)

  /**
   * Lists every persisted version of [name] (default `narrative-default`) ordered most recent
   * first. Backs the `/settings/prompts` page list (PR3). Empty list when nothing exists yet — the
   * page renders an empty state pointing to the seed migration.
   */
  fun listAll(name: String = NARRATIVE_FAMILY): List<PromptTemplate> =
    repository.findAllByNameOrderByCreatedAtDesc(name)

  /** Lookup by id — returns null when the row doesn't exist. */
  fun findById(id: UUID): PromptTemplate? = repository.findById(id).orElse(null)

  /**
   * Creates a new prompt version (Phase 3 PR4). Always lands with `is_active = false` — the caller
   * activates separately via [activate] so the create + activate split lets the user save a draft
   * against a stable baseline without going live. Optional fields are coerced from blank strings to
   * null at the boundary so the DB never carries `""` (which would mean « set but empty » and fool
   * the UI's null-check on optional fields).
   *
   * Validation lives here rather than in `@RequestBody @Valid` annotations because the rules are
   * trivial and project convention favours `require()` failures mapped to 400 by
   * [com.portfolioai.shared.GlobalExceptionHandler].
   */
  @Transactional
  fun create(input: CreatePromptInput): PromptTemplate {
    val name = input.name.trim()
    val version = input.version.trim()
    val systemPrompt = input.systemPrompt
    require(name.isNotBlank()) { "name is required" }
    require(name.length <= MAX_NAME_LENGTH) { "name exceeds $MAX_NAME_LENGTH characters" }
    require(version.isNotBlank()) { "version is required" }
    require(version.length <= MAX_VERSION_LENGTH) {
      "version exceeds $MAX_VERSION_LENGTH characters"
    }
    require(systemPrompt.isNotBlank()) { "system prompt is required" }
    require(systemPrompt.length <= MAX_SYSTEM_PROMPT_LENGTH) {
      "system prompt exceeds $MAX_SYSTEM_PROMPT_LENGTH characters"
    }
    val row =
      PromptTemplate(
        name = name,
        version = version,
        systemPrompt = systemPrompt,
        userTemplate = input.userTemplate?.takeIf { it.isNotBlank() },
        targetModel = input.targetModel?.takeIf { it.isNotBlank() },
        isActive = false,
        notes = input.notes?.takeIf { it.isNotBlank() },
      )
    val saved = repository.save(row)
    log.info(
      "Created prompt_template {} name={} version={} (inactive, awaiting explicit activate)",
      saved.id,
      saved.name,
      saved.version,
    )
    return saved
  }

  /**
   * Activates [id] — flips the currently active row of the same family to `is_active = false` (with
   * `deprecated_at = now()`), then sets the target row to `is_active = true` (with `activated_at =
   * now()`). Idempotent : activating an already-active row is a no-op.
   *
   * **Two-step write with explicit flush** : the partial unique index
   * `idx_prompt_template_active_per_name` guarantees at most one active row per family. Without the
   * `saveAndFlush` between deactivation and activation, Hibernate's batch flush could try to insert
   * the new active row before the old one is deactivated, tripping the constraint. The flush forces
   * the deactivation to hit the DB first ; both writes still live in the same `@Transactional` so
   * an activation failure rolls back cleanly.
   *
   * **Cache invalidated immediately** so the next `activePrompt()` call (e.g. the next narrative
   * run a few seconds later) picks up the new active row without waiting for the 1-min TTL.
   */
  @Transactional
  fun activate(id: UUID): PromptTemplate {
    val target =
      repository.findById(id).orElseThrow {
        NoSuchElementException("Prompt template $id not found")
      }
    if (target.isActive) {
      log.debug("Activate no-op : prompt_template {} already active", id)
      return target
    }

    val now = Instant.now()
    repository.findFirstByNameAndIsActiveTrue(target.name)?.let { current ->
      if (current.id != target.id) {
        current.isActive = false
        current.deprecatedAt = now
        repository.saveAndFlush(current)
        log.info(
          "Deactivated prompt_template {} version={} on family={}",
          current.id,
          current.version,
          current.name,
        )
      }
    }

    target.isActive = true
    target.activatedAt = now
    val saved = repository.save(target)
    invalidate(target.name)
    log.info(
      "Activated prompt_template {} version={} on family={}",
      saved.id,
      saved.version,
      saved.name,
    )
    return saved
  }

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

    // Defensive validation bounds. The DB schema (Flyway V8) caps `name` at VARCHAR(100) and
    // `version` at VARCHAR(50) so a longer input would fail at the JPA layer anyway — surfacing a
    // clean 400 from the service is friendlier than letting the constraint violation bubble. The
    // system prompt is TEXT (unbounded SQL-side), but 10_000 chars is well beyond what a sane
    // narrative prompt ever needs (today's seed is ~1200 chars) ; anything bigger is almost
    // certainly a paste accident from the user, reject early.
    const val MAX_NAME_LENGTH = 100
    const val MAX_VERSION_LENGTH = 50
    const val MAX_SYSTEM_PROMPT_LENGTH = 10_000

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
