package com.portfolioai.analysis.application

import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal

/**
 * System prompt for the Phase 1 narrative pipeline. The LLM is a **writer**, not a decider — it
 * digests the indicators that the code computed and produces a short, factual summary. It must not
 * predict prices, recommend buys/sells, or reference data not in the prompt.
 *
 * **Two-part design (v3, 2026-05-22)** — the prompt has been split into two pieces :
 *
 * - **Body** ([NARRATIVE_DEFAULT_BODY], persisted in `prompt_template.system_prompt`, editable via
 *   `/settings/prompts`) : the persona / tone / focus. Free-form ; even a single word like
 *   "bonjour" remains valid because the technical envelope wraps it with the JSON contract.
 * - **Technical envelope** ([NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX], hardcoded here, immutable from
 *   the UI) : the output contract (JSON shape), sentiment rule, null-skip rule, length constraints.
 *   Guarantees that no matter what the user puts in the body, the LLM still emits parseable,
 *   validate-able JSON.
 *
 * At runtime, [assembleNarrativeSystemPrompt] concatenates `body + envelope_suffix` and the result
 * is what [TickerNarrativePromptService.activePrompt] hands to the executor. The split is
 * transparent to the executor and to [LlmClient].
 *
 * **Source of truth** : the runner reads the body from the `prompt_template` table ; the constants
 * below are the safety-net fallback used only when the DB has no active row (bootstrap before
 * Flyway runs, or seed wiped manually). To change the body in production, edit the active row from
 * `/settings/prompts` — the cache invalidates and the next narrative run picks it up. Editing this
 * file only affects fresh clones with no DB seed (or the envelope, which is never overridable).
 *
 * Versioned : bump [NARRATIVE_PROMPT_VERSION] when the envelope or the default body changes — the
 * version string is what gets persisted on snapshots when the fallback path fires, so filters on
 * `prompt_version` still partition the data correctly.
 */
internal const val NARRATIVE_PROMPT_VERSION = "v3"

/**
 * Default editable body — the persona / tone / focus. Persisted into `prompt_template` by the
 * Flyway seed and overridable from `/settings/prompts`. Kept short on purpose : the technical
 * contract is in the envelope, this only needs to set the voice.
 */
internal val NARRATIVE_DEFAULT_BODY =
  """
  You are a financial writer. Given one ticker's current price and pre-computed indicators, produce a short factual technical summary — describe what the indicators show, no predictions, no buy/sell advice.
  """
    .trimIndent()

/**
 * Technical envelope — appended after the body at assembly time. **Immutable from the UI**, lives
 * only here. Defines the JSON output contract, the sentiment rule, the null-skip rule, and the
 * length ceiling that the validator enforces. The header line makes the boundary explicit in the
 * prompt so the LLM treats the contract as instructions even when the body is a single word.
 */
internal val NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX =
  """
  --- OUTPUT CONTRACT (do not deviate) ---

  Reply with ONLY this JSON object (no prose, no markdown fences) :
  {
    "summary": "A thorough technical summary, typically 5-12 sentences, walking through each available indicator (price vs MA50/MA200, RSI, momentum 30d/90d, drawdown, volume). Neutral, factual tone. No predictions, no buy/sell advice.",
    "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
    "keyPoints": ["3-5 bullets, each ≤15 words, each grounded in one indicator value from the input. No invented numbers."]
  }

  Sentiment rule: price above MA200 + positive momentum + RSI 50-70 → BULLISH ; price below MA200 + negative momentum + deep drawdown → BEARISH ; otherwise NEUTRAL.

  If an indicator is null in the input (series too short), skip it silently — never mention it's missing.
  """
    .trimIndent()

/**
 * Assembles the full system prompt sent to the LLM. The user-editable [body] comes first (so it
 * sets the persona / voice the model reads through), followed by the immutable technical envelope
 * that locks down the output contract.
 *
 * Blank or whitespace-only bodies are tolerated — the envelope alone is enough to elicit valid
 * JSON, which protects the dossier UX when a user accidentally clears the field.
 */
internal fun assembleNarrativeSystemPrompt(body: String): String {
  val trimmedBody = body.trim()
  return if (trimmedBody.isEmpty()) {
    NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX
  } else {
    "$trimmedBody\n\n$NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX"
  }
}

/**
 * Builds the user-message payload for one symbol. Skips any indicator that's null so the prompt
 * stays tight and the LLM can't hallucinate values from omissions.
 */
fun buildNarrativeUserMessage(quote: TickerQuote, indicators: Indicators): String {
  val lines = mutableListOf<String>()
  lines += "Ticker: ${quote.symbol}"
  quote.name?.let { lines += "Name: $it" }
  quote.currency?.let { lines += "Currency: $it" }
  quote.exchange?.let { lines += "Exchange: $it" }
  lines += "Current price: ${fmt(quote.price)}"
  lines += "As of: ${quote.asOf}"
  quote.fiftyTwoWeekHigh?.let { lines += "52-week high: ${fmt(it)}" }
  quote.fiftyTwoWeekLow?.let { lines += "52-week low: ${fmt(it)}" }
  lines += ""
  lines += "Technical indicators (only those that the series was long enough to compute):"
  indicators.rsi14?.let { lines += "- RSI(14): ${fmt(it)}" }
  indicators.ma50?.let { lines += "- MA50: ${fmt(it)}" }
  indicators.ma200?.let { lines += "- MA200: ${fmt(it)}" }
  indicators.distanceToMa50Pct?.let { lines += "- Distance to MA50: ${fmt(it)}%" }
  indicators.distanceToMa200Pct?.let { lines += "- Distance to MA200: ${fmt(it)}%" }
  indicators.momentum30d?.let { lines += "- Momentum 30d: ${fmt(it)}%" }
  indicators.momentum90d?.let { lines += "- Momentum 90d: ${fmt(it)}%" }
  indicators.perf1m?.let { lines += "- Perf 1m: ${fmt(it)}%" }
  indicators.perf3m?.let { lines += "- Perf 3m: ${fmt(it)}%" }
  indicators.perf1y?.let { lines += "- Perf 1y: ${fmt(it)}%" }
  indicators.drawdownFrom52wHigh?.let { lines += "- Drawdown from 52w high: ${fmt(it)}%" }
  indicators.volumeRelative30d?.let { lines += "- Volume vs 30d avg: ${fmt(it)}x" }
  return lines.joinToString("\n")
}

private fun fmt(v: BigDecimal): String = v.stripTrailingZeros().toPlainString()
