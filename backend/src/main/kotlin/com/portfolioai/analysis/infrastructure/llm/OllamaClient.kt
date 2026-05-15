package com.portfolioai.analysis.infrastructure.llm

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.domain.LlmClient
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

/**
 * Ollama provider — always instantiated alongside [ClaudeClient]. Selection between the two happens
 * in [RoutingLlmClient] based on the runtime [ConfigKeys.LLM_PROVIDER] value, so this bean exists
 * even when the active provider is `claude`.
 *
 * Both the model name and the read timeout are read per-call from [AppConfigService] so a runtime
 * tweak in `/settings/configuration` lands without a reboot. Trade-off : a fresh [RestClient] is
 * built on every [complete] invocation (the `SimpleClientHttpRequestFactory` read timeout is fixed
 * at construction, so we cannot mutate the existing one in place). Cost is microseconds —
 * acceptable on a path that already takes seconds.
 */
@Component
class OllamaClient(
  @Value("\${ollama.base-url:http://localhost:11434}") private val baseUrl: String,
  private val objectMapper: ObjectMapper,
  private val appConfig: AppConfigService,
) : LlmClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun complete(systemPrompt: String, userMessage: String, maxTokens: Int): String {
    val model = appConfig.getString(ConfigKeys.OLLAMA_MODEL)
    val timeoutMs = appConfig.getInt(ConfigKeys.LLM_TIMEOUT_SECONDS) * MILLIS_PER_SECOND
    log.info(
      "Calling Ollama model={} url={} maxTokens={} readTimeout={}ms",
      model,
      baseUrl,
      maxTokens,
      timeoutMs,
    )
    val combinedMessage = "$systemPrompt\n\n$userMessage"
    val body =
      mapOf(
        "model" to model,
        "stream" to false,
        "format" to "json",
        "options" to mapOf("num_predict" to maxTokens),
        "messages" to listOf(mapOf("role" to "user", "content" to combinedMessage)),
      )
    val raw =
      buildClient(timeoutMs).post().uri("/api/chat").body(body).exchange { _, response ->
        response.body.readBytes().toString(Charsets.UTF_8)
      } ?: error("Empty response from Ollama")

    val tree = objectMapper.readTree(raw)
    return tree.path("message").path("content").asText().also {
      if (it.isBlank()) error("Empty content in Ollama response: $raw")
    }
  }

  override fun modelId(): String = "ollama:${appConfig.getString(ConfigKeys.OLLAMA_MODEL)}"

  /**
   * Builds a one-shot [RestClient] with the read timeout matching the runtime
   * [ConfigKeys.LLM_TIMEOUT_SECONDS]. Default 400 s covers Ollama cold-start (model loaded into
   * VRAM on the first call after boot) ; the slider in `/settings/configuration` lets the user push
   * it to 900 s when running a heavier model on a slower machine.
   */
  private fun buildClient(timeoutMs: Int): RestClient =
    RestClient.builder()
      .baseUrl(baseUrl)
      .defaultHeader("content-type", "application/json")
      .requestFactory(
        SimpleClientHttpRequestFactory().apply {
          setConnectTimeout(CONNECT_TIMEOUT_MS)
          setReadTimeout(timeoutMs)
        }
      )
      .build()

  companion object {
    private const val MILLIS_PER_SECOND = 1_000
    private const val CONNECT_TIMEOUT_MS = 5_000
  }
}
