package com.portfolioai.config.application.dto

/** One config entry as exposed to the front. */
data class ConfigEntryDto(
  val key: String,
  val type: ConfigValueType,
  val currentValue: String?,
  val defaultValue: String?,
  val hasValue: Boolean,
  val isOverridden: Boolean,
)

enum class ConfigValueType {
  STRING,
  /**
   * Comma-separated list of emails. The UI renders a `mat-chip-grid` with one removable chip per
   * email plus an input to add new entries. The service validates each token contains `@` and is
   * non-blank after trim.
   */
  EMAILS,
}

/** Body of `PUT /api/config/{key}` — empty `value` is rejected (use DELETE/reset to clear). */
data class SetConfigRequest(val value: String)
