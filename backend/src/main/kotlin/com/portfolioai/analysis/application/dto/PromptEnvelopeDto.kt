package com.portfolioai.analysis.application.dto

/**
 * Read-only view of the immutable technical envelope appended after the editable body when the
 * narrative prompt is assembled. Surfaced by `GET /api/prompts/envelope` so the `/settings/prompts`
 * page can render the envelope in a collapsible « technical contract » panel — the user sees
 * exactly what the LLM receives around their body, but cannot edit it.
 *
 * [suffix] is the literal string concatenated after the body. [version] tracks the prompt family
 * version (mirrors `NARRATIVE_PROMPT_VERSION`) so the frontend can detect drift if a future
 * envelope change ships without a corresponding UI refresh.
 */
data class PromptEnvelopeDto(val version: String, val suffix: String)
