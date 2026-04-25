package com.portfolioai.analysis.infrastructure.llm

import kotlin.collections.get
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["llm.provider"], havingValue = "claude", matchIfMissing = true)
class ClaudeClient(
  @Value("\${anthropic.api.key}") private val apiKey: String,
  @Value("\${anthropic.api.model}") private val model: String,
) : LlmClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val restClient =
    RestClient.builder()
      .baseUrl("https://api.anthropic.com")
      .defaultHeader("x-api-key", apiKey)
      .defaultHeader("anthropic-version", "2023-06-01")
      .defaultHeader("content-type", "application/json")
      .build()

  override fun complete(systemPrompt: String, userMessage: String, maxTokens: Int): String {
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
}
