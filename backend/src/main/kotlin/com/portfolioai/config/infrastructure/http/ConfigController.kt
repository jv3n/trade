package com.portfolioai.config.infrastructure.http

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.config.application.dto.ConfigEntryDto
import com.portfolioai.config.application.dto.ConfigValueType
import com.portfolioai.config.application.dto.SetConfigRequest
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * REST entry point for runtime config :
 * - `GET /api/config` — list every known key with current value, default value, and whether it's
 *   overridden.
 * - `PUT /api/config/{key}` — set an override.
 * - `DELETE /api/config/{key}` — remove the override and fall back to the YAML default.
 */
@Tag(name = "Config", description = "Runtime-editable settings (login whitelist)")
@RestController
@RequestMapping("/api/config")
class ConfigController(private val service: AppConfigService) {

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

  private fun entryFor(key: String): ConfigEntryDto {
    val effective = service.getString(key)
    val type =
      if (key in ConfigKeys.EMAIL_LIST_KEYS) ConfigValueType.EMAILS else ConfigValueType.STRING
    return ConfigEntryDto(
      key = key,
      type = type,
      currentValue = effective,
      defaultValue = service.defaultFor(key),
      hasValue = effective.isNotBlank(),
      isOverridden = service.isOverridden(key),
    )
  }
}
