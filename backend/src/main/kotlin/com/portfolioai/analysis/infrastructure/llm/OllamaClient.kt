package com.portfolioai.analysis.infrastructure.llm

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["llm.provider"], havingValue = "ollama")
class OllamaClient(
  @Value("\${ollama.base-url:http://localhost:11434}") private val baseUrl: String,
  @Value("\${ollama.model:llama3.2:3b}") private val model: String,
  private val objectMapper: ObjectMapper,
) : LlmClient {
  private val log = LoggerFactory.getLogger(javaClass)

  private val restClient =
    RestClient.builder()
      .baseUrl(baseUrl)
      .defaultHeader("content-type", "application/json")
      .requestFactory(
        // Per-call read timeout. Aligned at 400 s with the frontend POLL_ABORT_SECONDS (and the
        // Phase 0 dedup window). Bumped from 180 s → 400 s on 2026-05-07 because users on
        // colder machines (or first-call cold start while Ollama loads the model) hit the 180 s
        // ceiling on portfolio-wide analyses. Trade-off : the previous 180 s gave the validator
        // retry path a 2 × budget within the 400 s frontend window ; at 400 s a single attempt
        // consumes the whole budget so the executor's MAX_ATTEMPTS=2 retry effectively becomes
        // single-shot under timeout pressure. Acceptable because (a) validator failures are
        // mostly parse errors which are near-instant, not timeouts, and (b) Phase 0 is frozen.
        SimpleClientHttpRequestFactory().apply {
          setConnectTimeout(5_000)
          setReadTimeout(400_000)
        }
      )
      .build()

  override fun complete(systemPrompt: String, userMessage: String, maxTokens: Int): String {
    log.info("Calling Ollama model={} url={} maxTokens={}", model, baseUrl, maxTokens)
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
      restClient.post().uri("/api/chat").body(body).exchange { _, response ->
        response.body.readBytes().toString(Charsets.UTF_8)
      } ?: error("Empty response from Ollama")

    val tree = objectMapper.readTree(raw)
    return tree.path("message").path("content").asText().also {
      if (it.isBlank()) error("Empty content in Ollama response: $raw")
    }
  }

  override fun modelId(): String = "ollama:$model"
}
