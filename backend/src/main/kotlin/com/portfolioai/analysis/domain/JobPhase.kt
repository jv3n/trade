package com.portfolioai.analysis.domain

/**
 * Granular pipeline state for a narrative job, surfaced over Server-Sent Events so the UI can
 * display "Calling LLM (38s)…" instead of a muted spinner during the 60-180 s Ollama window on Mac
 * CPU. Distinct from [JobStatus] which only tracks the BDD-persisted lifecycle (`PENDING / DONE /
 * ERROR`) — phases are richer and live in memory only.
 *
 * Order roughly follows the executor flow ([com.portfolioai.analysis.application
 * .TickerNarrativeExecutor]) :
 * - [LOADING_CONTEXT] — fetching market data + indicators (synchronous, fast).
 * - [CALLING_LLM] — outbound HTTP call to Claude or Ollama. The slowest phase, can hold for minutes
 *   on a CPU-bound Ollama daemon.
 * - [RECEIVED_RAW] — LLM responded ; about to parse.
 * - [PARSING] — JSON extraction from the LLM body.
 * - [VALIDATING] — domain-rule validation of the parsed object.
 * - [RETRY_PROMPT] — validator rejected, looping back with feedback (next attempt's [CALLING_LLM]
 *   follows immediately).
 * - [PERSISTING] — DB write of the snapshot.
 * - [DONE] — terminal success.
 * - [ERROR] — terminal failure (any phase can transition straight to [ERROR]).
 *
 * Also used as a key for the page Jobs DAG view (Phase 3+) — the per-phase granularity is the real
 * value of moving off polling, not the "fewer HTTP calls" angle.
 */
enum class JobPhase {
  LOADING_CONTEXT,
  CALLING_LLM,
  RECEIVED_RAW,
  PARSING,
  VALIDATING,
  RETRY_PROMPT,
  PERSISTING,
  DONE,
  ERROR;

  val terminal: Boolean
    get() = this == DONE || this == ERROR
}
