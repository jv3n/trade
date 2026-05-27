package com.portfolioai.config.application

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/**
 * YAML defaults for the three API-key secrets the app supports. Grouped together so
 * [AppConfigService]'s constructor doesn't drag a dozen `@Value` parameters — same shape as
 * [DataProvidersDefaults] and [LlmDefaults], pairwise.
 *
 * **Why not `@ConfigurationProperties`** — the three keys live under three different YAML root
 * paths (`market.twelvedata.*`, `market.finnhub.*`, `anthropic.api.*`) that grew organically as the
 * project added providers. A single `@ConfigurationProperties(prefix = "…")` can't span three roots
 * cleanly, and restructuring the YAML keys would break env-var bindings already documented in the
 * README. A `@Component` data class with `@Value`-bound constructor params keeps the existing keys
 * intact while still grouping them at the consumer.
 *
 * Default is empty string for all three : a fresh clone must boot without secrets so the user can
 * land on `/settings/configuration` and paste keys via the runtime UI. Adapters that require the
 * secret raise [com.portfolioai.shared.UpstreamUnavailableException] on the first actual call.
 */
@Component
data class SecretsDefaults(
  @Value("\${market.twelvedata.api-key:}") val twelveDataApiKey: String,
  @Value("\${market.finnhub.api-key:}") val finnhubApiKey: String,
  @Value("\${screener.polygon.api-key:}") val polygonApiKey: String,
  @Value("\${screener.fmp.api-key:}") val fmpApiKey: String,
  @Value("\${anthropic.api.key:}") val anthropicApiKey: String,
)
