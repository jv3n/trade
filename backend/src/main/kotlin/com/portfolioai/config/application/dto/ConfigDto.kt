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
  val allowedValues: List<AllowedValueDto>? = null,
)

/**
 * One option on an ENUM-typed config key. `disabledReason` is non-null when the option exists but
 * cannot currently be selected — for live provider toggles, this means the required API key is
 * empty (no DB override, no env var). The UI shows the option as disabled with a tooltip carrying
 * the reason (i18n key). `null` means the option is available.
 */
data class AllowedValueDto(val value: String, val disabledReason: String? = null)

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

/**
 * Body of `POST /api/config/llm/unload-model`. Forces Ollama to drop the named model from VRAM
 * (handy when switching models or to force a cold-start for latency comparison).
 */
data class UnloadModelRequest(val model: String)

/**
 * Body of `POST /api/config/llm/pull-model`. Tells Ollama to download a model from its registry
 * (e.g. `mistral:7b`) — replaces the manual `ollama pull <name>` terminal step that the
 * `/settings/configuration > LLM` panel previously required when a user wanted to test a new model.
 * Field name is `model` for consistency with [UnloadModelRequest] even though Ollama's own
 * `/api/pull` payload uses `name` ; the service translates between the two.
 */
data class PullModelRequest(val model: String)

/**
 * Body of `POST /api/config/llm/delete-model`. Removes the named model from the Ollama daemon's
 * local cache (frees disk + drops the entry from `availableModels`). Translates to Ollama's `DELETE
 * /api/delete` upstream — we keep the front API as POST for symmetry with the other `unload-model`
 * and `pull-model` endpoints.
 */
data class DeleteModelRequest(val model: String)
