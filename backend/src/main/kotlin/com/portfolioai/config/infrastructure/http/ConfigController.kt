package com.portfolioai.config.infrastructure.http

import com.portfolioai.analysis.application.dto.OllamaStatusDto
import com.portfolioai.analysis.infrastructure.llm.OllamaStatusService
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.config.application.dto.AllowedValueDto
import com.portfolioai.config.application.dto.ConfigEntryDto
import com.portfolioai.config.application.dto.ConfigValueType
import com.portfolioai.config.application.dto.DeleteModelRequest
import com.portfolioai.config.application.dto.PullModelRequest
import com.portfolioai.config.application.dto.SetConfigRequest
import com.portfolioai.config.application.dto.TestConfigRequest
import com.portfolioai.config.application.dto.TestConfigResult
import com.portfolioai.config.application.dto.TestLlmRequest
import com.portfolioai.config.application.dto.UnloadModelRequest
import com.portfolioai.config.infrastructure.ConfigTestClient
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * REST entry point for runtime config :
 * - `GET /api/config` — list every known key with current value (masked for secrets), default
 *   value, and whether it's overridden.
 * - `PUT /api/config/{key}` — set an override.
 * - `DELETE /api/config/{key}` — remove the override and fall back to the YAML default.
 * - `POST /api/config/test/{provider}` — exercise a candidate API key against the live provider
 *   without saving it. `provider` is `twelvedata`, `finnhub`, `polygon`, `fmp`, or `anthropic`.
 * - `POST /api/config/test/llm` — probe a candidate (provider, model) pair with a fixed prompt and
 *   report latency + whether the response actually contains "OK".
 *
 * Secret keys (API keys) are never echoed back in the GET response — the UI only learns whether a
 * value is set, not its content. The user is expected to rotate the key when they forget it.
 */
@Tag(
  name = "Config",
  description =
    "Runtime-editable settings (providers, cache TTL, LLM model, API keys) + connectivity probes",
)
@RestController
@RequestMapping("/api/config")
class ConfigController(
  private val service: AppConfigService,
  private val testClient: ConfigTestClient,
  private val ollamaStatusService: OllamaStatusService,
) {

  @GetMapping
  fun list(): List<ConfigEntryDto> = service.listedKeys().sorted().map { key -> entryFor(key) }

  @PutMapping("/{key}")
  fun set(@PathVariable key: String, @RequestBody body: SetConfigRequest): ConfigEntryDto {
    require(body.value.isNotBlank()) { "Config value cannot be blank — use DELETE to reset" }
    service.set(key, body.value.trim())
    return entryFor(key)
  }

  @DeleteMapping("/{key}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  fun reset(@PathVariable key: String) = service.reset(key)

  @PostMapping("/test/twelvedata")
  fun testTwelveData(@RequestBody body: TestConfigRequest): TestConfigResult =
    testClient.testTwelveData(body.value.trim())

  @PostMapping("/test/finnhub")
  fun testFinnhub(@RequestBody body: TestConfigRequest): TestConfigResult =
    testClient.testFinnhub(body.value.trim())

  @PostMapping("/test/polygon")
  fun testPolygon(@RequestBody body: TestConfigRequest): TestConfigResult =
    testClient.testPolygon(body.value.trim())

  @PostMapping("/test/fmp")
  fun testFmp(@RequestBody body: TestConfigRequest): TestConfigResult =
    testClient.testFmp(body.value.trim())

  @PostMapping("/test/anthropic")
  fun testAnthropic(@RequestBody body: TestConfigRequest): TestConfigResult =
    testClient.testAnthropicKey(body.value.trim())

  @PostMapping("/test/llm")
  fun testLlm(@RequestBody body: TestLlmRequest): TestConfigResult =
    testClient.testLlm(body.provider.trim(), body.model.trim())

  /**
   * Lightweight probe of the local Ollama daemon — daemon up/down + latency, models pulled locally,
   * models currently in VRAM with their idle-timeout countdown. Polled by the LLM section of
   * `/settings/configuration` every ~10 s while the user is on that page.
   *
   * Always returns 200 with [OllamaStatusDto.daemonReachable] = `false` on failure rather than a
   * 503 — the panel renders a red chip in-band, the rest of the settings page stays usable.
   */
  @GetMapping("/llm/status") fun llmStatus(): OllamaStatusDto = ollamaStatusService.probe()

  /**
   * Forces Ollama to drop the named model from VRAM. Returns the freshly re-probed snapshot so the
   * panel can update in one round-trip — no need to follow up with a separate `GET /llm/status`
   * request.
   */
  @PostMapping("/llm/unload-model")
  fun unloadOllamaModel(@RequestBody body: UnloadModelRequest): OllamaStatusDto =
    ollamaStatusService.unloadModel(body.model.trim())

  /**
   * Tells Ollama to pull (download) the named model from its registry. Blocks the request thread
   * 1-3 min on a typical ~4 GB model — acceptable single-user, replaces the manual `ollama pull
   * <name>` terminal step the panel previously required. Returns the freshly re-probed snapshot so
   * the panel sees the new model land in `availableModels` in one round-trip.
   */
  @PostMapping("/llm/pull-model")
  fun pullOllamaModel(@RequestBody body: PullModelRequest): OllamaStatusDto =
    ollamaStatusService.pullModel(body.model.trim())

  /**
   * Removes the named model from the Ollama daemon's local cache (frees disk space). Returns the
   * freshly re-probed snapshot so the panel + pull dialog drop the chip in one round-trip. Fast
   * (~10-50 ms) — translates to Ollama's `DELETE /api/delete` upstream.
   */
  @PostMapping("/llm/delete-model")
  fun deleteOllamaModel(@RequestBody body: DeleteModelRequest): OllamaStatusDto =
    ollamaStatusService.deleteModel(body.model.trim())

  private fun entryFor(key: String): ConfigEntryDto {
    val isSecret = key in ConfigKeys.SECRET_KEYS
    // Delegates to AppConfigService.allowedValuesFor so the LLM provider toggle drops `ollama`
    // automatically when the env-side flag (`app.ollama.enabled=false`) excludes it.
    val allowedRaw = service.allowedValuesFor(key)
    val isOverridden = service.isOverridden(key)
    val effective = service.getString(key)
    val default = service.defaultFor(key)
    val type =
      when {
        isSecret -> ConfigValueType.SECRET
        allowedRaw != null -> ConfigValueType.ENUM
        key in ConfigKeys.INT_KEYS -> ConfigValueType.INT
        key in ConfigKeys.EMAIL_LIST_KEYS -> ConfigValueType.EMAILS
        else -> ConfigValueType.STRING
      }
    return ConfigEntryDto(
      key = key,
      type = type,
      currentValue = if (isSecret) null else effective,
      defaultValue = if (isSecret) null else default,
      hasValue = effective.isNotBlank(),
      isOverridden = isOverridden,
      allowedValues = allowedRaw?.map { value -> annotateAllowedValue(key, value) },
    )
  }

  /**
   * Annotates an ENUM allowed value with a `disabledReason` when it requires an API key that's not
   * configured. Provider gating : if the user picks `market.provider=twelvedata` without having set
   * `market.twelvedata.api-key`, the toggle is rendered disabled in the UI. The `mock` option is
   * always available (no required key). The reason carries the property path of the missing key —
   * the frontend translates it via `configurationPage.providerDisabled.missingKey` (i18n
   * placeholder substitution).
   */
  private fun annotateAllowedValue(providerKey: String, value: String): AllowedValueDto {
    val requiredKey = ConfigKeys.PROVIDER_REQUIRED_KEY[providerKey to value]
    val disabled = requiredKey != null && service.getString(requiredKey).isBlank()
    return AllowedValueDto(value = value, disabledReason = if (disabled) requiredKey else null)
  }
}
