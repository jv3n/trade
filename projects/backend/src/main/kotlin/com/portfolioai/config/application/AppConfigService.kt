package com.portfolioai.config.application

import com.portfolioai.config.domain.AppConfigEntry
import com.portfolioai.config.infrastructure.persistence.AppConfigRepository
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Source of truth for runtime-editable settings : a DB override on top of a YAML default. Every
 * read goes to the database : production runs several instances, and a cache in one would keep an
 * email the admin removed through another.
 */
@Service
class AppConfigService(
  private val repository: AppConfigRepository,
  @Value("\${app.allowed.emails:}") private val allowedEmailsDefault: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  /** Returns the DB override if present, else the YAML default. Never null for a known key. */
  fun getString(key: String): String =
    defaultFor(key).let { default ->
      repository.findById(key).map { it.configValue }.orElse(default)
    }

  /**
   * Parsed view of [ConfigKeys.ALLOWED_EMAILS] — the CSV stored as a single string is split,
   * trimmed, lowercased, deduplicated, and empty tokens dropped. Consumed by
   * `UserProvisioningService` at each login. Empty set = the admins alone.
   */
  fun getAllowedEmails(): Set<String> = parseEmailList(getString(ConfigKeys.ALLOWED_EMAILS))

  /** Whether the given key currently has a DB override (vs falling back to YAML). */
  fun isOverridden(key: String): Boolean =
    key in ConfigKeys.KNOWN_KEYS && repository.existsById(key)

  /** Returns the YAML default for the key — used by the UI to show "default vs current". */
  fun defaultFor(key: String): String =
    when (key) {
      ConfigKeys.ALLOWED_EMAILS -> allowedEmailsDefault
      else -> throw IllegalArgumentException("Unknown config key: $key")
    }

  @Transactional
  fun set(key: String, value: String) {
    require(key in ConfigKeys.KNOWN_KEYS) { "Unknown config key: $key" }
    validate(key, value)
    val entry =
      repository.findById(key).orElse(null)?.also {
        it.configValue = value
        it.updatedAt = Instant.now()
      } ?: AppConfigEntry(configKey = key, configValue = value)
    repository.save(entry)
    // **Never add `value={}` to this log line** — `ALLOWED_EMAILS` is a CSV of emails (PII, cf.
    // `CLAUDE.md > Backend > Never log user emails`). The key alone is enough to audit.
    log.info("Config override set : key={}", key)
  }

  @Transactional
  fun reset(key: String) {
    require(key in ConfigKeys.KNOWN_KEYS) { "Unknown config key: $key" }
    if (repository.existsById(key)) repository.deleteById(key)
    // Same redaction contract as [set] — log only the key, never the value.
    log.info("Config override reset to default : key={}", key)
  }

  private fun validate(key: String, value: String) {
    if (key in ConfigKeys.EMAIL_LIST_KEYS) {
      // Strict validation : every comma-separated token must contain '@' and be non-blank after
      // trim. Defends against typos (e.g. an admin pastes "alice@x.com bob@y.com" with a space and
      // expects two entries) — surface the error at save time, not as a silently-broken whitelist.
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
  }
}

/**
 * Parses a comma-separated email list into a normalized [Set]. Used by [AppConfigService] for the
 * read path and reused by tests that need to assert on the same shape without going through the
 * service.
 */
internal fun parseEmailList(raw: String): Set<String> =
  raw.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
