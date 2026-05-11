package com.portfolioai.analysis.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * Versioned narrative prompt persisted in `prompt_template` (Flyway V8). Replaces the hardcoded
 * `NARRATIVE_SYSTEM_PROMPT` string from `TickerNarrativePrompt.kt` so the prompt can be edited live
 * from `/settings/prompts` without a redeploy (Phase 3 PR3+PR4).
 *
 * **Active row contract** — at most one row per [name] can have `is_active = true` (enforced by the
 * partial unique index `idx_prompt_template_active_per_name`). [TickerNarrativePromptService] looks
 * up the active row for the conventional family name `narrative-default` ; activating a new version
 * flips the previous row to `is_active = false` in the same transaction.
 *
 * **`userTemplate` is nullable on purpose** — the user message is built today by the Kotlin
 * function `buildNarrativeUserMessage` (conditional formatting per indicator, BigDecimal-aware
 * `fmt()`). If we ever templatize that side too, this column will carry the template string ; until
 * then, `null` means "use the Kotlin builder".
 *
 * **`targetModel` is nullable too** — when set, the row is reserved to a specific LLM (e.g.
 * `claude-opus-4-6`) which lets us specialise the prompt per backend if Claude vs Ollama diverge on
 * the same string. v1 leaves all rows null = "any model".
 */
@Entity
@Table(name = "prompt_template")
class PromptTemplate(
  @Id val id: UUID = UUID.randomUUID(),
  @Column(nullable = false, length = 100) val name: String,
  @Column(nullable = false, length = 50) val version: String,
  @Column(name = "system_prompt", nullable = false, columnDefinition = "text")
  val systemPrompt: String,
  @Column(name = "user_template", columnDefinition = "text") val userTemplate: String? = null,
  @Column(name = "target_model", length = 100) val targetModel: String? = null,
  @Column(name = "is_active", nullable = false) var isActive: Boolean = false,
  @Column(name = "created_at", nullable = false) val createdAt: Instant = Instant.now(),
  @Column(name = "activated_at") var activatedAt: Instant? = null,
  @Column(name = "deprecated_at") var deprecatedAt: Instant? = null,
  @Column(columnDefinition = "text") val notes: String? = null,
)
