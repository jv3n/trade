package com.portfolioai.analysis.domain

/**
 * One transition in the narrative pipeline, serialised over SSE to the frontend. Immutable on
 * purpose : late-connecting clients receive the event list verbatim from the publisher's bucket.
 *
 * @property phase the new [JobPhase] reached.
 * @property attempt 1-based attempt index (parser/validator can retry once, so `attempt` is `1` on
 *   the initial pass and `2` on the retry).
 * @property elapsedMs milliseconds since the publisher first saw this jobId — gives the UI an "X
 *   seconds in" counter without needing the runner-start clock.
 * @property error populated only on [JobPhase.ERROR] — the message that will land in
 *   `ticker_narrative_job.error` too, mirrored here for clients that don't poll the job row.
 * @property payload free-form structured info (model used on [JobPhase.CALLING_LLM], validator
 *   error list on [JobPhase.RETRY_PROMPT], etc.). Optional ; absent in v1 for simplicity.
 */
data class JobEvent(
  val phase: JobPhase,
  val attempt: Int,
  val elapsedMs: Long,
  val error: String? = null,
  val payload: String? = null,
)
