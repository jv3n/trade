package com.portfolioai.config.application.dto

/**
 * One config entry as exposed to the front. Secret keys (API keys) never leak the actual value —
 * `currentValue` is null and [hasValue] tells the UI whether something is set. Non-secret keys
 * (TTL) ship the value as-is so the UI can render the slider position.
 *
 * `defaultValue` is also masked for secret keys ; otherwise the front would render the env-var
 * default in cleartext on the page (and screenshots).
 */
data class ConfigEntryDto(
  val key: String,
  val type: ConfigValueType,
  val currentValue: String?,
  val defaultValue: String?,
  val hasValue: Boolean,
  val isOverridden: Boolean,
  /**
   * Non-null on [ConfigValueType.ENUM] keys — UI renders a toggle group restricted to this list.
   */
  val allowedValues: List<String>? = null,
)

enum class ConfigValueType {
  STRING,
  INT,
  SECRET,
  ENUM,
}

/** Body of `PUT /api/config/{key}` — empty `value` is rejected (use DELETE/reset to clear). */
data class SetConfigRequest(val value: String)

/** Body of `POST /api/config/test/{provider}` — caller passes the candidate value to test. */
data class TestConfigRequest(val value: String)

/**
 * Body of `POST /api/config/test/llm`. Carries the candidate provider + model so the user can test
 * a configuration before saving it (e.g. switch from `qwen2.5:3b` to `qwen2.5:7b` and confirm the
 * larger model is pulled and answering before swapping the live setting).
 */
data class TestLlmRequest(val provider: String, val model: String)

/** Result of a connectivity test : `ok=true` ⇒ provider responded as expected. */
data class TestConfigResult(val ok: Boolean, val message: String)
