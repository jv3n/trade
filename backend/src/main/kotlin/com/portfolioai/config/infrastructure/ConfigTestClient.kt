package com.portfolioai.config.infrastructure

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.config.application.dto.TestConfigResult
import java.net.http.HttpClient
import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * Dedicated probe used by the runtime-config "Tester" buttons. Exists separately from the provider
 * adapters because (a) this should work even when the active provider is `mock` — the user wants to
 * validate a key before switching ; (b) it tests a candidate value, not the saved one, so it cannot
 * reuse beans whose config is already injected.
 *
 * Probes used :
 * - Twelve Data : `GET /quote?symbol=AAPL&apikey=…` — cheap (1 credit), returns a small JSON.
 * - Finnhub : `GET /quote?symbol=AAPL&token=…` — also cheap, single call.
 * - LLM : `POST /v1/messages` (Claude) or `POST /api/chat` (Ollama) with the fixed prompt `Reply
 *   with exactly the word OK.` — short input, ~10 output tokens, validates both connectivity (the
 *   model name resolves on the provider side) and parse correctness (the answer actually contains
 *   "OK"). The user reads the latency to compare cold-start cost across models when picking one for
 *   their machine.
 *
 * Returns a flat `(ok, message)` so the front renders a green/red banner. We deliberately surface
 * the upstream HTTP code and a short truncated body when something fails — knowing whether you
 * typo'd the key vs the upstream is rate-limiting matters.
 */
@Component
class ConfigTestClient(
  private val appConfig: AppConfigService,
  @Value("\${market.twelvedata.base-url:https://api.twelvedata.com}")
  private val twelveDataBaseUrl: String,
  @Value("\${market.finnhub.base-url:https://finnhub.io/api/v1}")
  private val finnhubBaseUrl: String,
  @Value("\${ollama.base-url:http://localhost:11434}") private val ollamaBaseUrl: String,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  private val rest: RestClient =
    RestClient.builder()
      .requestFactory(
        JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
          )
          .apply { setReadTimeout(Duration.ofSeconds(10)) }
      )
      .defaultHeader("Accept", "application/json")
      .build()

  /**
   * The LLM probe deliberately uses a longer read timeout than the API-key probes : Ollama can
   * cold-start a model on first call (downloads the weights into VRAM) which legitimately takes
   * 30–90 s on a workstation, and Claude can stall under network hiccups. Capped well under the
   * `OllamaClient` 400 s ceiling so a stuck probe doesn't tie up the request thread for a model
   * that just isn't available locally.
   */
  private val llmRest: RestClient =
    RestClient.builder()
      .requestFactory(
        JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
          )
          .apply { setReadTimeout(Duration.ofSeconds(LLM_PROBE_TIMEOUT_SECONDS)) }
      )
      .defaultHeader("Accept", "application/json")
      .defaultHeader("Content-Type", "application/json")
      .build()

  fun testTwelveData(apiKey: String): TestConfigResult {
    if (apiKey.isBlank()) return TestConfigResult(false, "API key is blank")
    return try {
      val body =
        rest
          .get()
          .uri("$twelveDataBaseUrl/quote?symbol=AAPL&apikey={key}", apiKey)
          .retrieve()
          .body(Map::class.java) ?: return TestConfigResult(false, "Empty response")
      // Twelve Data returns HTTP 200 with `{status: "error", code, message}` on auth/rate-limit
      // failures. We have to inspect the body to know whether the key is valid.
      val status = body["status"]?.toString()
      if (status == "error") {
        val code = body["code"]?.toString() ?: "?"
        val message = body["message"]?.toString()?.take(200) ?: "unknown error"
        TestConfigResult(false, "Twelve Data error $code : $message")
      } else {
        TestConfigResult(true, "OK — Twelve Data accepted the key")
      }
    } catch (e: HttpClientErrorException) {
      log.warn("Twelve Data test failed with {}", e.statusCode)
      TestConfigResult(false, "HTTP ${e.statusCode.value()} from Twelve Data")
    } catch (e: ResourceAccessException) {
      log.warn("Twelve Data test unreachable : {}", e.message)
      TestConfigResult(false, "Unreachable : ${e.message?.take(120)}")
    }
  }

  fun testFinnhub(apiKey: String): TestConfigResult {
    if (apiKey.isBlank()) return TestConfigResult(false, "API key is blank")
    return try {
      // Finnhub returns HTTP 401 with a plain body on bad keys ; the success body is a small JSON
      // with `c` (current price) populated for known symbols.
      val body =
        rest
          .get()
          .uri("$finnhubBaseUrl/quote?symbol=AAPL&token={key}", apiKey)
          .retrieve()
          .body(Map::class.java) ?: return TestConfigResult(false, "Empty response")
      val current = body["c"]
      if (current == null || current == 0 || current == 0.0) {
        TestConfigResult(false, "Finnhub returned no quote — key may be invalid")
      } else {
        TestConfigResult(true, "OK — Finnhub accepted the key")
      }
    } catch (e: HttpClientErrorException) {
      val code = e.statusCode.value()
      val msg =
        when (code) {
          401 -> "Invalid Finnhub API key"
          429 -> "Rate-limited — try again in a minute"
          else -> "HTTP $code from Finnhub"
        }
      log.warn("Finnhub test failed : {}", msg)
      TestConfigResult(false, msg)
    } catch (e: ResourceAccessException) {
      log.warn("Finnhub test unreachable : {}", e.message)
      TestConfigResult(false, "Unreachable : ${e.message?.take(120)}")
    }
  }

  fun testLlm(provider: String, model: String): TestConfigResult {
    if (model.isBlank()) return TestConfigResult(false, "Model name is blank")
    return when (provider) {
      ConfigKeys.PROVIDER_CLAUDE ->
        probeClaude(model, appConfig.getString(ConfigKeys.ANTHROPIC_API_KEY))
      ConfigKeys.PROVIDER_OLLAMA -> probeOllama(model)
      else -> TestConfigResult(false, "Unknown LLM provider: '$provider'")
    }
  }

  /**
   * Validates a candidate Anthropic key without saving it. Mirrors the [testTwelveData] /
   * [testFinnhub] UX : the user types a key in the password input, hits Tester, and we round-trip
   * to Claude with the typed value rather than the saved one. The model used is whatever's
   * currently configured (`anthropic.api.model`) — a valid key against an unknown model will
   * surface a 404 from Anthropic, which is still useful diagnostic.
   */
  fun testAnthropicKey(candidateKey: String): TestConfigResult {
    if (candidateKey.isBlank()) return TestConfigResult(false, "API key is blank")
    val model = appConfig.getString(ConfigKeys.ANTHROPIC_API_MODEL)
    return probeClaude(model, candidateKey)
  }

  private fun probeClaude(model: String, apiKey: String): TestConfigResult {
    if (apiKey.isBlank()) {
      return TestConfigResult(false, "Anthropic API key is not configured — cannot probe Claude")
    }
    val started = System.currentTimeMillis()
    return try {
      val body =
        mapOf(
          "model" to model,
          "max_tokens" to LLM_PROBE_MAX_TOKENS,
          "messages" to listOf(mapOf("role" to "user", "content" to PROBE_PROMPT)),
        )
      @Suppress("UNCHECKED_CAST")
      val response =
        llmRest
          .post()
          .uri("https://api.anthropic.com/v1/messages")
          .header("x-api-key", apiKey)
          .header("anthropic-version", "2023-06-01")
          .body(body)
          .retrieve()
          .body(Map::class.java) as? Map<*, *>
          ?: return TestConfigResult(false, "Empty response from Claude")

      val text = extractClaudeText(response)
      verdict(provider = "Claude", model = model, text = text, startedAtMs = started)
    } catch (e: HttpClientErrorException) {
      val payload = e.responseBodyAsString.take(200)
      log.warn("Claude probe failed status={} body={}", e.statusCode, payload)
      TestConfigResult(false, "Claude HTTP ${e.statusCode.value()} : $payload")
    } catch (e: ResourceAccessException) {
      log.warn("Claude probe unreachable : {}", e.message)
      TestConfigResult(false, "Claude unreachable : ${e.message?.take(120)}")
    }
  }

  private fun probeOllama(model: String): TestConfigResult {
    val started = System.currentTimeMillis()
    return try {
      // Plain-text probe — we deliberately do NOT pass `format=json` here. The real OllamaClient
      // forces JSON for narrative parsing, but the probe just needs a free-form "OK" reply ;
      // forcing JSON would make the model wrap its answer in an object and make the substring
      // check brittle.
      val body =
        mapOf(
          "model" to model,
          "stream" to false,
          "options" to mapOf("num_predict" to LLM_PROBE_MAX_TOKENS),
          "messages" to listOf(mapOf("role" to "user", "content" to PROBE_PROMPT)),
        )
      @Suppress("UNCHECKED_CAST")
      val response =
        llmRest.post().uri("$ollamaBaseUrl/api/chat").body(body).retrieve().body(Map::class.java)
          as? Map<*, *> ?: return TestConfigResult(false, "Empty response from Ollama")

      val message = response["message"] as? Map<*, *>
      val text = (message?.get("content") as? String).orEmpty()
      verdict(provider = "Ollama", model = model, text = text, startedAtMs = started)
    } catch (e: HttpClientErrorException) {
      val payload = e.responseBodyAsString.take(200)
      log.warn("Ollama probe failed status={} body={}", e.statusCode, payload)
      // 404 with "model not found" is the canonical error when the user types a model they
      // haven't pulled — call that out specifically since the fix is a `tilt llm:pull-...`.
      val hint =
        if (e.statusCode.value() == 404) {
          " — try `ollama pull $model` (or the matching Tilt button)"
        } else ""
      TestConfigResult(false, "Ollama HTTP ${e.statusCode.value()} : $payload$hint")
    } catch (e: ResourceAccessException) {
      log.warn("Ollama probe unreachable : {}", e.message)
      TestConfigResult(false, "Ollama unreachable at $ollamaBaseUrl — is the daemon running ?")
    }
  }

  private fun extractClaudeText(response: Map<*, *>): String {
    val content = response["content"] as? List<*> ?: return ""
    val first = content.firstOrNull() as? Map<*, *> ?: return ""
    return (first["text"] as? String).orEmpty()
  }

  /**
   * Common verdict — measures latency and verifies the response actually contains "OK". A provider
   * that times out, returns 200 with empty text, or rambles without saying "OK" is surfaced as a
   * failure : the user wanted a confirmation, not a "well, the call didn't crash" green light.
   */
  private fun verdict(
    provider: String,
    model: String,
    text: String,
    startedAtMs: Long,
  ): TestConfigResult {
    val elapsedMs = System.currentTimeMillis() - startedAtMs
    val latency = "%.1fs".format(elapsedMs / 1000.0)
    return if (text.trim().lowercase().contains("ok")) {
      TestConfigResult(true, "OK — $provider ($model) replied in $latency")
    } else {
      val preview = text.trim().take(120).ifEmpty { "(empty)" }
      TestConfigResult(false, "$provider ($model) did not say OK in $latency : $preview")
    }
  }

  companion object {
    private const val PROBE_PROMPT = "Reply with exactly the word OK."
    private const val LLM_PROBE_MAX_TOKENS = 16
    private const val LLM_PROBE_TIMEOUT_SECONDS = 120L
  }
}
