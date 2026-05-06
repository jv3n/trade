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
 * (`@PostConstruct`). YAML defaults are injected via `@Value` constructor params and used as
 * fallback when no override exists.
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
  @Value("\${market.twelvedata.api-key:}") private val twelveDataKeyDefault: String,
  @Value("\${market.finnhub.api-key:}") private val finnhubKeyDefault: String,
  @Value("\${market.cache.ttl-minutes:15}") private val cacheTtlDefault: Int,
  @Value("\${market.provider:mock}") private val marketProviderDefault: String,
  @Value("\${news.provider:mock}") private val newsProviderDefault: String,
  @Value("\${analyst.provider:mock}") private val analystProviderDefault: String,
  @Value("\${earnings.provider:mock}") private val earningsProviderDefault: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)
  private val overrides = ConcurrentHashMap<String, String>()

  @PostConstruct
  fun primeCache() {
    repository.findAll().forEach { overrides[it.configKey] = it.configValue }
    log.info("AppConfigService primed with {} override(s)", overrides.size)
  }

  /** Returns the DB override if present, else the YAML default. Never null for a known key. */
  fun getString(key: String): String = overrides[key] ?: defaultFor(key)

  fun getInt(key: String): Int = getString(key).toInt()

  /** Whether the given key currently has a DB override (vs falling back to YAML). */
  fun isOverridden(key: String): Boolean = overrides.containsKey(key)

  /** Returns the YAML default for the key — used by the UI to show "default vs current". */
  fun defaultFor(key: String): String =
    when (key) {
      ConfigKeys.TWELVEDATA_API_KEY -> twelveDataKeyDefault
      ConfigKeys.FINNHUB_API_KEY -> finnhubKeyDefault
      ConfigKeys.CACHE_TTL_MINUTES -> cacheTtlDefault.toString()
      ConfigKeys.MARKET_PROVIDER -> marketProviderDefault
      ConfigKeys.NEWS_PROVIDER -> newsProviderDefault
      ConfigKeys.ANALYST_PROVIDER -> analystProviderDefault
      ConfigKeys.EARNINGS_PROVIDER -> earningsProviderDefault
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
    log.info("Config override set : key={}", key)
    if (previous != value) eventPublisher.publishEvent(ConfigChangedEvent(key, value))
  }

  @Transactional
  fun reset(key: String) {
    require(key in ConfigKeys.KNOWN_KEYS) { "Unknown config key: $key" }
    val previous = overrides[key]
    if (repository.existsById(key)) repository.deleteById(key)
    overrides.remove(key)
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
    }
    val allowed = ConfigKeys.ENUM_KEYS[key]
    if (allowed != null) {
      require(value in allowed) { "$key must be one of $allowed (got '$value')" }
    }
  }
}

/**
 * Fired when a runtime config value changes (set or reset). Listeners can react — e.g.
 * [com.portfolioai.market.MarketConfig] rebuilds its Caffeine spec when
 * [ConfigKeys.CACHE_TTL_MINUTES] changes.
 */
data class ConfigChangedEvent(val key: String, val newValue: String)
