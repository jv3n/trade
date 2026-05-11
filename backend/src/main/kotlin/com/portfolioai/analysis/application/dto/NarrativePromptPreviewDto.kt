package com.portfolioai.analysis.application.dto

/**
 * Read-only preview of the prompt the narrative pipeline would send to the LLM for a given ticker,
 * **without** firing an actual call. Backs the `/settings/prompt-preview` page : useful to inspect
 * what bloats the user message on a real symbol, debug tokenisation, or compare prompt versions
 * side by side.
 *
 * The system prompt and version come from the currently active row in `prompt_template` (resolved
 * at request time via `TickerNarrativePromptService` since Phase 3 PR1) — so the preview reflects
 * what the runner would *actually* send right now, including any live edit the user has just
 * activated. The user message is built by `buildNarrativeUserMessage(quote, indicators)` from a
 * live `TickerSnapshot`, mirroring the runner's own logic.
 */
data class NarrativePromptPreviewDto(
  val symbol: String,
  val systemPrompt: String,
  val userMessage: String,
  val systemPromptChars: Int,
  val userMessageChars: Int,
  val promptVersion: String,
)
