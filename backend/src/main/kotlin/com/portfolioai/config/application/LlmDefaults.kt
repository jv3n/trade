package com.portfolioai.config.application

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/**
 * YAML defaults for the LLM card under `/settings/configuration > LLM` — the provider switch + the
 * two model names (one per provider, the active one depending on [llmProvider]) + the unified
 * timeout that pilots both `OllamaClient.readTimeout` and the dedup window on
 * `TickerNarrativeJobStore`.
 *
 * `llmProvider` lives here rather than in [DataProvidersDefaults] because the LLM card groups it
 * with the model name and timeout, and toggling it usually goes hand-in-hand with picking a model.
 * The frontend renders both blocks under the same `<app-llm-config>` card.
 *
 * See [SecretsDefaults] for the rationale on `@Component` + `@Value` rather than
 * `@ConfigurationProperties`.
 */
@Component
data class LlmDefaults(
  @Value("\${llm.provider:claude}") val llmProvider: String,
  @Value("\${ollama.model:qwen2.5:3b}") val ollamaModel: String,
  @Value("\${anthropic.api.model:claude-opus-4-6}") val anthropicApiModel: String,
  @Value("\${llm.timeout-seconds:400}") val llmTimeoutSeconds: Int,
)
