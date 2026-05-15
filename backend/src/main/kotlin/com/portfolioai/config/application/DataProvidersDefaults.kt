package com.portfolioai.config.application

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/**
 * YAML defaults for the four data-provider switches surfaced under the `/settings/configuration >
 * Providers de données` sub-section. Each key flips one bounded context between `mock` (default,
 * deterministic synthetic data) and `<real-provider>` (Twelve Data for market, Finnhub for news /
 * analyst / earnings).
 *
 * The LLM provider lives in [LlmDefaults] rather than here even though its YAML key shape is
 * `llm.provider` — the frontend groups it with the LLM card (model + timeout) and toggling it
 * happens alongside those, not alongside the data-provider switches.
 *
 * See [SecretsDefaults] for the rationale on `@Component` + `@Value` rather than
 * `@ConfigurationProperties`.
 */
@Component
data class DataProvidersDefaults(
  @Value("\${market.provider:mock}") val marketProvider: String,
  @Value("\${news.provider:mock}") val newsProvider: String,
  @Value("\${analyst.provider:mock}") val analystProvider: String,
  @Value("\${earnings.provider:mock}") val earningsProvider: String,
)
