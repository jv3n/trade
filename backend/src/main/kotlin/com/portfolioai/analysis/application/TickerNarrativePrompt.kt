package com.portfolioai.analysis.application

import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal

/**
 * System prompt for the Phase 1 narrative pipeline. The LLM is a **writer**, not a decider — it
 * digests the indicators that the code computed and produces a short, factual summary. It must not
 * predict prices, recommend buys/sells, or reference data not in the prompt.
 *
 * Versioned : bump [NARRATIVE_PROMPT_VERSION] when this prompt or its expected output format
 * changes, so persisted snapshots can be filtered by prompt version when comparing model outputs.
 */
internal const val NARRATIVE_PROMPT_VERSION = "v2"

internal val NARRATIVE_SYSTEM_PROMPT =
  """
You are a financial writer. Given one ticker's current price and pre-computed indicators, produce a short factual technical summary — describe what the indicators show, no predictions, no buy/sell advice.

Reply with ONLY this JSON object (no prose, no markdown fences) :
{
  "summary": "2-3 sentences describing posture: price vs MAs, RSI, momentum, drawdown. Neutral tone, no forecasts.",
  "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
  "keyPoints": ["3-5 bullets, each ≤15 words, each grounded in one indicator value from the input. No invented numbers."]
}

Sentiment rule: price above MA200 + positive momentum + RSI 50-70 → BULLISH ; price below MA200 + negative momentum + deep drawdown → BEARISH ; otherwise NEUTRAL.

If an indicator is null in the input (series too short), skip it silently — never mention it's missing.
"""
    .trimIndent()

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
