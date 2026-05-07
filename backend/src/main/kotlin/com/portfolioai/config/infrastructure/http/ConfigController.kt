package com.portfolioai.config.infrastructure.http

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.config.application.dto.ConfigEntryDto
import com.portfolioai.config.application.dto.ConfigValueType
import com.portfolioai.config.application.dto.SetConfigRequest
import com.portfolioai.config.application.dto.TestConfigRequest
import com.portfolioai.config.application.dto.TestConfigResult
import com.portfolioai.config.application.dto.TestLlmRequest
import com.portfolioai.config.infrastructure.ConfigTestClient
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
 *   without saving it. `provider` is `twelvedata` or `finnhub`.
 * - `POST /api/config/test/llm` — probe a candidate (provider, model) pair with a fixed prompt and
 *   report latency + whether the response actually contains "OK".
 *
 * Secret keys (API keys) are never echoed back in the GET response — the UI only learns whether a
 * value is set, not its content. The user is expected to rotate the key when they forget it.
 */
@RestController
@RequestMapping("/api/config")
class ConfigController(
  private val service: AppConfigService,
  private val testClient: ConfigTestClient,
) {

  @GetMapping
  fun list(): List<ConfigEntryDto> = ConfigKeys.KNOWN_KEYS.sorted().map { key -> entryFor(key) }

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

  @PostMapping("/test/llm")
  fun testLlm(@RequestBody body: TestLlmRequest): TestConfigResult =
    testClient.testLlm(body.provider.trim(), body.model.trim())

  private fun entryFor(key: String): ConfigEntryDto {
    val isSecret = key in ConfigKeys.SECRET_KEYS
    val allowedValues = ConfigKeys.ENUM_KEYS[key]
    val isOverridden = service.isOverridden(key)
    val effective = service.getString(key)
    val default = service.defaultFor(key)
    val type =
      when {
        isSecret -> ConfigValueType.SECRET
        allowedValues != null -> ConfigValueType.ENUM
        key in ConfigKeys.INT_KEYS -> ConfigValueType.INT
        else -> ConfigValueType.STRING
      }
    return ConfigEntryDto(
      key = key,
      type = type,
      currentValue = if (isSecret) null else effective,
      defaultValue = if (isSecret) null else default,
      hasValue = effective.isNotBlank(),
      isOverridden = isOverridden,
      allowedValues = allowedValues,
    )
  }
}
