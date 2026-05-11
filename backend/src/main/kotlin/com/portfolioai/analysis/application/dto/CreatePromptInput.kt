package com.portfolioai.analysis.application.dto

/**
 * Request body of `POST /api/prompts` (Phase 3 PR4 — create new version of a prompt). The page
 * `/settings/prompts` posts this from the inline editor after the user clicks « Save as new version
 * » ; the created row lands with `is_active = false` and is activated separately via `POST
 * /api/prompts/{id}/activate` (PR3).
 *
 * **Why two steps** : the create + activate split lets a user save a draft version without making
 * it live, useful when iterating on a prompt against a known-stable baseline. The frontend can
 * chain both calls when the user wants « save and activate », but the API surface stays
 * compositional.
 *
 * Optional fields use Kotlin nullables on the wire ; the service trims and treats blank strings as
 * null at the boundary so the DB never carries `""` (which would mean « set, but empty » and fool
 * the UI's null-check on optional fields).
 */
data class CreatePromptInput(
  val name: String,
  val version: String,
  val systemPrompt: String,
  val userTemplate: String? = null,
  val targetModel: String? = null,
  val notes: String? = null,
)
