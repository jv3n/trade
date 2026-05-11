package com.portfolioai.analysis.application.dto

import com.portfolioai.analysis.domain.PromptTemplate
import java.time.Instant
import java.util.UUID

/**
 * Wire shape of one [PromptTemplate] row exposed by `/api/prompts`. Phase 3 PR3 — the
 * `/settings/prompts` page consumes a list of these to render the prompt management table, and a
 * single one when the user expands a row to see the system prompt body.
 *
 * The DTO mirrors the entity 1:1 (no field hiding for now) — the system prompt is the whole point
 * of the page, and there's no PII / secret in the row. The `version` string is what the user sees
 * as the row label ; `isActive` drives the chip + the « Activate » button visibility.
 */
data class PromptTemplateDto(
  val id: UUID,
  val name: String,
  val version: String,
  val systemPrompt: String,
  val userTemplate: String?,
  val targetModel: String?,
  val isActive: Boolean,
  val createdAt: Instant,
  val activatedAt: Instant?,
  val deprecatedAt: Instant?,
  val notes: String?,
)

fun PromptTemplate.toDto(): PromptTemplateDto =
  PromptTemplateDto(
    id = id,
    name = name,
    version = version,
    systemPrompt = systemPrompt,
    userTemplate = userTemplate,
    targetModel = targetModel,
    isActive = isActive,
    createdAt = createdAt,
    activatedAt = activatedAt,
    deprecatedAt = deprecatedAt,
    notes = notes,
  )
