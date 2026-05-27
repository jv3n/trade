package com.portfolioai.config.application

import com.portfolioai.config.domain.AppConfigEntry
import com.portfolioai.config.infrastructure.persistence.AppConfigRepository
import jakarta.annotation.PostConstruct
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Source of truth for runtime-editable settings. Reads YAML defaults at boot, layers DB overrides
 * on top, and publishes a [ConfigChangedEvent] whenever a value changes so beans that need to react
 * (cache TTL rebuild) can listen.
 *
 * **Read path** — [getString] / [getInt] hit a [ConcurrentHashMap] cache primed at boot from the DB
 * (`@PostConstruct`). YAML defaults are injected via three grouped `@Component` data classes
 * ([SecretsDefaults], [DataProvidersDefaults], [LlmDefaults]) — see the `spring-boot` skill for the
 * rationale on this pattern vs `@ConfigurationProperties`. The cache TTL is the only standalone
 * `@Value` because it doesn't bundle naturally with any of the three groups. Defaults are used as
 * fallback when no DB override exists.
 *
 * **Write path** — [set] / [reset] write through to the DB then update the in-memory cache, so
 * subsequent reads on the same process see the new value immediately. No clustering concern : the
 * app is single-instance (Tilt local + a future single-host deploy). If we ever scale out, the
 * cache-prime would need to listen for DB changes (LISTEN/NOTIFY) — out of scope for v1.
 *
 * Why a cache at all : the API key is read on every chart fetch, the TTL is read on every cache
 * config rebuild — DB hits on every call are wasteful. Cache stays in sync because every write goes
 * through this service.
 */
@Service
class AppConfigService(
  private val repository: AppConfigRepository,
  private val eventPublisher: ApplicationEventPublisher,
  private val secrets: SecretsDefaults,
  private val dataProviders: DataProvidersDefaults,
  private val llm: LlmDefaults,
  @Value("\${market.cache.ttl-minutes:15}") private val cacheTtlDefault: Int,
  @Value("\${app.allowed.emails:}") private val allowedEmailsDefault: String,
  @Value("\${app.ollama.enabled:true}") private val ollamaEnabledFlag: Boolean,
) {
  private val log = LoggerFactory.getLogger(javaClass)
  private val overrides = ConcurrentHashMap<String, String>()

  @PostConstruct
  fun primeCache() {
    repository.findAll().forEach { overrides[it.configKey] = it.configValue }
    pruneStaleOllamaOverrides()
    log.info("AppConfigService primed with {} override(s)", overrides.size)
  }

  /**
   * Defense in depth on environments where Ollama is disabled (`app.ollama.enabled=false`) : if the
   * DB carries stale `llm.provider=ollama` or `ollama.model=…` rows (e.g. from a local-to-prod DB
   * clone), drop them from the in-memory cache so the next [getString] falls back to the YAML
   * default for this env. The DB rows themselves are left untouched — historical record stays
   * intact, only the runtime view is sanitised.
   */
  private fun pruneStaleOllamaOverrides() {
    if (isOllamaEnabled()) return
    if (overrides[ConfigKeys.LLM_PROVIDER] == ConfigKeys.PROVIDER_OLLAMA) {
      log.warn(
        "Pruning stale `{}={}` override — invalid when app.ollama.enabled=false",
        ConfigKeys.LLM_PROVIDER,
        ConfigKeys.PROVIDER_OLLAMA,
      )
      overrides.remove(ConfigKeys.LLM_PROVIDER)
    }
    if (overrides.containsKey(ConfigKeys.OLLAMA_MODEL)) {
      log.warn(
        "Pruning stale `{}` override — invalid when app.ollama.enabled=false",
        ConfigKeys.OLLAMA_MODEL,
      )
      overrides.remove(ConfigKeys.OLLAMA_MODEL)
    }
  }

  /** Returns the DB override if present, else the YAML default. Never null for a known key. */
  fun getString(key: String): String = overrides[key] ?: defaultFor(key)

  fun getInt(key: String): Int = getString(key).toInt()

  /**
   * Parsed view of [ConfigKeys.ALLOWED_EMAILS] — the CSV stored as a single string is split,
   * trimmed, lowercased, deduplicated, and empty tokens dropped. Consumed by
   * [CustomOAuth2UserService] at each login. Empty set = open mode (no gating ; let everyone in).
   *
   * Returns a fresh `Set` on every call — fine because logins are cheap (~handful per day) and the
   * underlying string is short. If this ever becomes hot, memoize against the current override
   * value.
   */
  fun getAllowedEmails(): Set<String> = parseEmailList(getString(ConfigKeys.ALLOWED_EMAILS))

  /** Whether the given key currently has a DB override (vs falling back to YAML). */
  fun isOverridden(key: String): Boolean = overrides.containsKey(key)

  /**
   * Whether Ollama-related runtime configuration is exposed in this environment. Local dev → `true`
   * ; prod (Cloud Run, cf. `application-prod.yml`) → `false` because no daemon is deployed
   * alongside the backend. Consumed by [allowedValuesFor] + [listedKeys] to hide the ollama
   * option/entries, and by [validate] to reject any write that would re-enable them out-of-band.
   */
  fun isOllamaEnabled(): Boolean = ollamaEnabledFlag

  /**
   * Subset of [ConfigKeys.KNOWN_KEYS] exposed by the listing endpoint in the current environment.
   * Drops [ConfigKeys.OLLAMA_MODEL] when [isOllamaEnabled] is `false` — otherwise the entry would
   * surface in `/settings/configuration` and invite a stuck-state write.
   */
  fun listedKeys(): Set<String> =
    if (isOllamaEnabled()) ConfigKeys.KNOWN_KEYS
    else ConfigKeys.KNOWN_KEYS - ConfigKeys.OLLAMA_MODEL

  /**
   * Allowed values for an ENUM key, filtered for the current environment. Returns the static
   * [ConfigKeys.ENUM_KEYS] list with [ConfigKeys.PROVIDER_OLLAMA] removed from
   * [ConfigKeys.LLM_PROVIDER] when [isOllamaEnabled] is `false`. Non-ENUM keys return `null`.
   */
  fun allowedValuesFor(key: String): List<String>? {
    val raw = ConfigKeys.ENUM_KEYS[key] ?: return null
    return if (key == ConfigKeys.LLM_PROVIDER && !isOllamaEnabled()) {
      raw - ConfigKeys.PROVIDER_OLLAMA
    } else raw
  }

  /** Returns the YAML default for the key — used by the UI to show "default vs current". */
  fun defaultFor(key: String): String =
    when (key) {
      ConfigKeys.TWELVEDATA_API_KEY -> secrets.twelveDataApiKey
      ConfigKeys.FINNHUB_API_KEY -> secrets.finnhubApiKey
      ConfigKeys.POLYGON_API_KEY -> secrets.polygonApiKey
      ConfigKeys.FMP_API_KEY -> secrets.fmpApiKey
      ConfigKeys.ANTHROPIC_API_KEY -> secrets.anthropicApiKey
      ConfigKeys.CACHE_TTL_MINUTES -> cacheTtlDefault.toString()
      ConfigKeys.MARKET_PROVIDER -> dataProviders.marketProvider
      ConfigKeys.NEWS_PROVIDER -> dataProviders.newsProvider
      ConfigKeys.ANALYST_PROVIDER -> dataProviders.analystProvider
      ConfigKeys.EARNINGS_PROVIDER -> dataProviders.earningsProvider
      ConfigKeys.SCREENER_PROVIDER -> dataProviders.screenerProvider
      ConfigKeys.LLM_PROVIDER -> llm.llmProvider
      ConfigKeys.OLLAMA_MODEL -> llm.ollamaModel
      ConfigKeys.ANTHROPIC_API_MODEL -> llm.anthropicApiModel
      ConfigKeys.LLM_TIMEOUT_SECONDS -> llm.llmTimeoutSeconds.toString()
      ConfigKeys.ALLOWED_EMAILS -> allowedEmailsDefault
      else -> throw IllegalArgumentException("Unknown config key: $key")
    }

  @Transactional
  fun set(key: String, value: String) {
    require(key in ConfigKeys.KNOWN_KEYS) { "Unknown config key: $key" }
    validate(key, value)
    val previous = overrides[key]
    val entry =
      repository.findById(key).orElse(null)?.also {
        it.configValue = value
        it.updatedAt = Instant.now()
      } ?: AppConfigEntry(configKey = key, configValue = value)
    repository.save(entry)
    overrides[key] = value
    // **Never add `value={}` to this log line.** `KNOWN_KEYS` includes `ALLOWED_EMAILS` (CSV of
    // emails — PII, cf. `CLAUDE.md > Backend > Never log user emails`) and the SECRET keys
    // (`TWELVEDATA_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`). Logging the value would
    // land them in GCP Cloud Logging in cleartext (default 30-day retention). The key alone is
    // enough to audit « who changed what when » via the timestamp + the override row in
    // `app_config`. Same constraint applies to [reset]'s log line below.
    log.info("Config override set : key={}", key)
    if (previous != value) eventPublisher.publishEvent(ConfigChangedEvent(key, value))
  }

  @Transactional
  fun reset(key: String) {
    require(key in ConfigKeys.KNOWN_KEYS) { "Unknown config key: $key" }
    val previous = overrides[key]
    if (repository.existsById(key)) repository.deleteById(key)
    overrides.remove(key)
    // Same redaction contract as [set] — log only the key, never the value (PII / SECRETs).
    log.info("Config override reset to default : key={}", key)
    if (previous != null) eventPublisher.publishEvent(ConfigChangedEvent(key, defaultFor(key)))
  }

  private fun validate(key: String, value: String) {
    if (key in ConfigKeys.INT_KEYS) {
      val intValue =
        value.toIntOrNull() ?: throw IllegalArgumentException("$key must be an integer")
      if (key == ConfigKeys.CACHE_TTL_MINUTES) {
        require(intValue in 5..60) { "$key must be between 5 and 60 minutes" }
      }
      if (key == ConfigKeys.LLM_TIMEOUT_SECONDS) {
        // Lower bound 60 s : even Claude (1-3 s typical) needs headroom for a network hiccup.
        // Upper bound 900 s : matches the 15-min step on the slider — beyond that, an analysis
        // that's still pending isn't a slow LLM, it's a stuck process and the user should
        // diagnose Tilt logs rather than wait.
        require(intValue in 60..900) { "$key must be between 60 and 900 seconds" }
      }
    }
    val allowed = allowedValuesFor(key)
    if (allowed != null) {
      require(value in allowed) { "$key must be one of $allowed (got '$value')" }
    }
    // Defense in depth on the Ollama-disabled environments — `ollama.model` is a free-form STRING
    // (not an ENUM, so the allowed-values check above doesn't cover it). Reject any write to it
    // when the daemon isn't deployed in this environment, otherwise a stale ollama.model row in
    // `app_config` could carry stale state to a future env where ollama gets re-enabled.
    if (key == ConfigKeys.OLLAMA_MODEL && !isOllamaEnabled()) {
      throw IllegalArgumentException(
        "$key cannot be set in this environment (app.ollama.enabled=false)"
      )
    }
    if (key in ConfigKeys.EMAIL_LIST_KEYS) {
      // Strict validation : every comma-separated token must contain '@' and be non-blank after
      // trim. Defends against typos (e.g. an admin pastes "alice@x.com bob@y.com" with a space and
      // expects two entries) — surface the error at save time, not as a silently-broken whitelist
      // that lets the wrong email in.
      value
        .split(",")
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .forEach { token ->
          require("@" in token) {
            "$key contains malformed entry '$token' — each comma-separated token must be a valid email"
          }
        }
    }
    // Provider gating : refuse a switch to a live provider when the required API key isn't
    // configured (neither in DB override nor in YAML fallback). The frontend already grays out
    // the option (`AllowedValueDto.disabledReason`) but a direct PUT could bypass that — we
    // defend in depth so the runtime config never lands in a stuck state where the user has to
    // SQL-reset the override to recover. The `mock` option is always available ; only live
    // values are gated.
    val requiredKey = ConfigKeys.PROVIDER_REQUIRED_KEY[key to value]
    if (requiredKey != null && getString(requiredKey).isBlank()) {
      throw IllegalArgumentException(
        "$key=$value requires $requiredKey to be configured first (DB override or env var)"
      )
    }
  }
}

/**
 * Fired when a runtime config value changes (set or reset). Listeners can react — e.g.
 * [com.portfolioai.market.MarketConfig] rebuilds its Caffeine spec when
 * [ConfigKeys.CACHE_TTL_MINUTES] changes.
 */
data class ConfigChangedEvent(val key: String, val newValue: String)

/**
 * Parses a comma-separated email list into a normalized [Set]. Used by [AppConfigService] for the
 * read path and reused by tests that need to assert on the same shape without going through the
 * service.
 */
internal fun parseEmailList(raw: String): Set<String> =
  raw.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
