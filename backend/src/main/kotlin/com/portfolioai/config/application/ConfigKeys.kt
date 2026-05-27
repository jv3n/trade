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
  const val POLYGON_API_KEY = "screener.polygon.api-key"
  const val FMP_API_KEY = "screener.fmp.api-key"
  const val ANTHROPIC_API_KEY = "anthropic.api.key"
  const val CACHE_TTL_MINUTES = "market.cache.ttl-minutes"
  const val MARKET_PROVIDER = "market.provider"
  const val NEWS_PROVIDER = "news.provider"
  const val ANALYST_PROVIDER = "analyst.provider"
  const val EARNINGS_PROVIDER = "earnings.provider"
  const val SCREENER_PROVIDER = "screener.provider"
  const val LLM_PROVIDER = "llm.provider"
  const val OLLAMA_MODEL = "ollama.model"
  const val ANTHROPIC_API_MODEL = "anthropic.api.model"
  const val LLM_TIMEOUT_SECONDS = "llm.timeout-seconds"

  /**
   * Comma-separated whitelist of emails authorised to complete the OAuth login. Empty value = open
   * mode (anyone with a Google account is let in — backward-compat for fresh deploys before the
   * admin posts the first list). Non-empty = gated mode : the effective whitelist is the union of
   * this list and `app.admin.emails` (admins are auto-included so the operator can't lock
   * themselves out by removing their own email from the UI).
   */
  const val ALLOWED_EMAILS = "app.allowed.emails"

  const val PROVIDER_MOCK = "mock"
  const val PROVIDER_TWELVEDATA = "twelvedata"
  const val PROVIDER_FINNHUB = "finnhub"
  const val PROVIDER_POLYGON = "polygon"
  const val PROVIDER_FMP = "fmp"
  const val PROVIDER_CLAUDE = "claude"
  const val PROVIDER_OLLAMA = "ollama"

  val SECRET_KEYS: Set<String> =
    setOf(TWELVEDATA_API_KEY, FINNHUB_API_KEY, POLYGON_API_KEY, FMP_API_KEY, ANTHROPIC_API_KEY)
  val INT_KEYS: Set<String> = setOf(CACHE_TTL_MINUTES, LLM_TIMEOUT_SECONDS)
  val EMAIL_LIST_KEYS: Set<String> = setOf(ALLOWED_EMAILS)

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
      SCREENER_PROVIDER to listOf(PROVIDER_MOCK, PROVIDER_POLYGON, PROVIDER_FMP),
      LLM_PROVIDER to listOf(PROVIDER_MOCK, PROVIDER_CLAUDE, PROVIDER_OLLAMA),
    )

  /**
   * Mapping `(provider key, live value) → required SECRET key`. The UI uses this to disable the
   * live option in a toggle when the required key is empty, and the backend uses it to reject a
   * `set(provider, liveValue)` if the prerequisite is missing — defense in depth against a stuck
   * state where the runtime config selects a provider that can't actually serve.
   *
   * `mock` values never appear here — `mock` providers don't need any key (they're deterministic
   * synthetic data, no network call). The `ollama` value is also absent because Ollama doesn't use
   * an API key ; if the daemon isn't reachable the client surfaces a 503 at call time, which is a
   * different failure mode than missing creds. Only the keyed live providers need gating.
   */
  val PROVIDER_REQUIRED_KEY: Map<Pair<String, String>, String> =
    mapOf(
      (MARKET_PROVIDER to PROVIDER_TWELVEDATA) to TWELVEDATA_API_KEY,
      (NEWS_PROVIDER to PROVIDER_FINNHUB) to FINNHUB_API_KEY,
      (ANALYST_PROVIDER to PROVIDER_FINNHUB) to FINNHUB_API_KEY,
      (EARNINGS_PROVIDER to PROVIDER_FINNHUB) to FINNHUB_API_KEY,
      (SCREENER_PROVIDER to PROVIDER_POLYGON) to POLYGON_API_KEY,
      (SCREENER_PROVIDER to PROVIDER_FMP) to FMP_API_KEY,
      (LLM_PROVIDER to PROVIDER_CLAUDE) to ANTHROPIC_API_KEY,
    )

  val KNOWN_KEYS: Set<String> =
    setOf(
      TWELVEDATA_API_KEY,
      FINNHUB_API_KEY,
      POLYGON_API_KEY,
      FMP_API_KEY,
      ANTHROPIC_API_KEY,
      CACHE_TTL_MINUTES,
      MARKET_PROVIDER,
      NEWS_PROVIDER,
      ANALYST_PROVIDER,
      EARNINGS_PROVIDER,
      SCREENER_PROVIDER,
      LLM_PROVIDER,
      OLLAMA_MODEL,
      ANTHROPIC_API_MODEL,
      LLM_TIMEOUT_SECONDS,
      ALLOWED_EMAILS,
    )
}
