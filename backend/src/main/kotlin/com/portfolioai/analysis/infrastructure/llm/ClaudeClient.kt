package com.portfolioai.analysis.infrastructure.llm

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

/**
 * Claude provider — always instantiated alongside [OllamaClient]. Selection between the two happens
 * in [RoutingLlmClient] based on the runtime [ConfigKeys.LLM_PROVIDER] value, so this bean exists
 * even when the active provider is `ollama`. The model name is read per-call from
 * [AppConfigService] so a model switch (`claude-opus-4-6` → `claude-sonnet-4-5`) lands without a
 * reboot ; only the API key is still YAML-bound (rotated rarely, set at boot via env var).
 */
@Component
class ClaudeClient(
  @Value("\${anthropic.api.key}") private val apiKey: String,
  private val appConfig: AppConfigService,
) : LlmClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val restClient =
    RestClient.builder()
      .baseUrl("https://api.anthropic.com")
      .defaultHeader("x-api-key", apiKey)
      .defaultHeader("anthropic-version", "2023-06-01")
      .defaultHeader("content-type", "application/json")
      .requestFactory(
        SimpleClientHttpRequestFactory().apply {
          setConnectTimeout(10_000)
          setReadTimeout(60_000)
        }
      )
      .build()

  override fun complete(systemPrompt: String, userMessage: String, maxTokens: Int): String {
    val model = appConfig.getString(ConfigKeys.ANTHROPIC_API_MODEL)
    log.debug("Calling Claude API model={}", model)
    val body =
      mapOf(
        "model" to model,
        "max_tokens" to maxTokens,
        "system" to systemPrompt,
        "messages" to listOf(mapOf("role" to "user", "content" to userMessage)),
      )
    @Suppress("UNCHECKED_CAST")
    val response =
      restClient.post().uri("/v1/messages").body(body).retrieve().body(Map::class.java) as Map<*, *>

    @Suppress("UNCHECKED_CAST") val content = (response["content"] as List<*>).first() as Map<*, *>
    return content["text"] as String
  }

  override fun modelId(): String = "claude:${appConfig.getString(ConfigKeys.ANTHROPIC_API_MODEL)}"
}
