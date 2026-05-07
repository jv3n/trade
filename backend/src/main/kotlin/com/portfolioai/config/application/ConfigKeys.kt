package com.portfolioai.config.application

import com.portfolioai.config.application.ConfigKeys.KNOWN_KEYS

/**
 * Registry of runtime-editable config keys. Adding a new key happens in three places :
 * 1. Add the constant here (and to [KNOWN_KEYS]) with its type.
 * 2. Inject the YAML default into [AppConfigService] (`@Value(...)` constructor parameter).
 * 3. Wire its consumer to read via [AppConfigService] instead of `@Value` (so live changes apply).
 *
 * Keep the list short — only what's worth editing without a reboot. Stuff that's stable across the
 * lifetime of the app (db url, port…) belongs in YAML, not here.
 */
object ConfigKeys {
  const val TWELVEDATA_API_KEY = "market.twelvedata.api-key"
  const val FINNHUB_API_KEY = "market.finnhub.api-key"
  const val CACHE_TTL_MINUTES = "market.cache.ttl-minutes"
  const val MARKET_PROVIDER = "market.provider"
  const val NEWS_PROVIDER = "news.provider"
  const val ANALYST_PROVIDER = "analyst.provider"
  const val EARNINGS_PROVIDER = "earnings.provider"
  const val LLM_PROVIDER = "llm.provider"
  const val OLLAMA_MODEL = "ollama.model"
  const val ANTHROPIC_API_MODEL = "anthropic.api.model"
  const val LLM_TIMEOUT_SECONDS = "llm.timeout-seconds"

  const val PROVIDER_MOCK = "mock"
  const val PROVIDER_TWELVEDATA = "twelvedata"
  const val PROVIDER_FINNHUB = "finnhub"
  const val PROVIDER_CLAUDE = "claude"
  const val PROVIDER_OLLAMA = "ollama"

  val SECRET_KEYS: Set<String> = setOf(TWELVEDATA_API_KEY, FINNHUB_API_KEY)
  val INT_KEYS: Set<String> = setOf(CACHE_TTL_MINUTES, LLM_TIMEOUT_SECONDS)

  /**
   * Keys whose value is constrained to a fixed list of strings. The UI renders them as a toggle
   * group ; the service rejects any value outside the list.
   */
  val ENUM_KEYS: Map<String, List<String>> =
    mapOf(
      MARKET_PROVIDER to listOf(PROVIDER_MOCK, PROVIDER_TWELVEDATA),
      NEWS_PROVIDER to listOf(PROVIDER_MOCK, PROVIDER_FINNHUB),
      ANALYST_PROVIDER to listOf(PROVIDER_MOCK, PROVIDER_FINNHUB),
      EARNINGS_PROVIDER to listOf(PROVIDER_MOCK, PROVIDER_FINNHUB),
      LLM_PROVIDER to listOf(PROVIDER_CLAUDE, PROVIDER_OLLAMA),
    )

  val KNOWN_KEYS: Set<String> =
    setOf(
      TWELVEDATA_API_KEY,
      FINNHUB_API_KEY,
      CACHE_TTL_MINUTES,
      MARKET_PROVIDER,
      NEWS_PROVIDER,
      ANALYST_PROVIDER,
      EARNINGS_PROVIDER,
      LLM_PROVIDER,
      OLLAMA_MODEL,
      ANTHROPIC_API_MODEL,
      LLM_TIMEOUT_SECONDS,
    )
}
