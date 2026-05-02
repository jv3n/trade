package com.portfolioai.analysis.application.dto

/**
 * Read-only preview of the prompt the narrative pipeline would send to the LLM for a given ticker,
 * **without** firing an actual call. Backs the `/settings/prompt-preview` page : useful to inspect
 * what bloats the user message on a real symbol, debug tokenisation, or compare prompt versions
 * side by side.
 *
 * The system prompt is the static `NARRATIVE_SYSTEM_PROMPT` (versioned by
 * `NARRATIVE_PROMPT_VERSION`). The user message is built by `buildNarrativeUserMessage(quote,
 * indicators)` from a live `TickerSnapshot`, so it reflects exactly what would be sent right now.
 */
data class NarrativePromptPreviewDto(
  val symbol: String,
  val systemPrompt: String,
  val userMessage: String,
  val systemPromptChars: Int,
  val userMessageChars: Int,
  val promptVersion: String,
)
