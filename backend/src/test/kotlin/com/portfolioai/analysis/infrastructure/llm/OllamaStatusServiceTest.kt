package com.portfolioai.analysis.infrastructure.llm

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * Tests on [OllamaStatusService] — verifies the daemon probe against a local [MockWebServer] rather
 * than a real Ollama install. The service backs the polling panel on `/settings/configuration
 * > LLM`, so the failure modes documented here are exactly what the user sees in the UI.
 *
 * What we pin :
 * - **Happy path** — a daemon serving `/api/tags` + `/api/ps` with valid JSON yields a complete
 *   [OllamaStatusDto] with sorted available models, loaded models with their `expires_at` parsed,
 *   and a measurable latency.
 * - **Daemon unreachable** — a server that refuses connections (port closed) returns
 *   `daemonReachable: false` with an [OllamaStatusDto.errorMessage] populated, NOT an exception
 *   that would 503 the polling endpoint and break the panel.
 * - **5xx upstream** — same fail-soft contract, surfaces the HTTP code in the message.
 * - **Malformed JSON** — when `/api/tags` returns a body without a `models` array, the service
 *   yields an empty list rather than crashing. Same for `/api/ps`. We have observed Ollama version
 *   skew shipping unexpected schemas across releases — fail-soft on schema drift is intentional.
 * - **Missing optional fields on `/api/ps`** — a loaded model entry without `expires_at` /
 *   `size_vram` parses fine with those fields nulled out (Ollama versions do not always emit them).
 * - **Sorted available models** — the UI lists chips alphabetically ; the service does the sort so
 *   the front doesn't have to.
 */
class OllamaStatusServiceTest {

  private lateinit var server: MockWebServer
  private lateinit var service: OllamaStatusService

  @BeforeEach
  fun setUp() {
    server = MockWebServer()
    server.start()
    service = OllamaStatusService(baseUrl = server.url("/").toString().trimEnd('/'))
  }

  @AfterEach
  fun tearDown() {
    server.shutdown()
  }

  // ---------------------------------------------------------------------- happy path

  @Test
  fun `returns a complete snapshot when both endpoints succeed`() {
    server.enqueue(jsonOk(TWO_TAGS_BODY))
    server.enqueue(jsonOk(ONE_LOADED_MODEL_BODY))

    val out = service.probe()

    assertTrue(out.daemonReachable)
    assertEquals(server.url("/").toString().trimEnd('/'), out.baseUrl)
    assertNotNull(out.latencyMs)
    assertTrue(out.latencyMs!! >= 0)
    assertNull(out.errorMessage)
    // Sorted alphabetically by the service so the UI doesn't need to.
    assertEquals(listOf("llama3.2:3b", "qwen2.5:3b"), out.availableModels)
    assertEquals(1, out.loadedModels.size)
    assertEquals("qwen2.5:3b", out.loadedModels[0].name)
    assertNotNull(out.loadedModels[0].expiresAt)
    assertEquals(2_008_000_000L, out.loadedModels[0].sizeVramBytes)
  }

  // ---------------------------------------------------------------------- fail-soft

  @Test
  fun `daemon refusing connections yields daemonReachable=false`() {
    // Killing the server simulates "Ollama is not running on the configured port" — the most
    // common real-world failure that the panel exists to surface.
    server.shutdown()

    val out = service.probe()

    assertFalse(out.daemonReachable)
    assertNull(out.latencyMs)
    assertTrue(out.loadedModels.isEmpty())
    assertTrue(out.availableModels.isEmpty())
    assertNotNull(out.errorMessage)
  }

  @Test
  fun `5xx upstream surfaces as fail-soft with HTTP code in the message`() {
    server.enqueue(MockResponse().setResponseCode(500).setBody("internal error"))

    val out = service.probe()

    assertFalse(out.daemonReachable)
    assertTrue(
      out.errorMessage?.contains("500") == true,
      "expected 500 in error message, got '${out.errorMessage}'",
    )
  }

  // ---------------------------------------------------------------------- schema drift

  @Test
  fun `tags body without models array yields empty available models`() {
    server.enqueue(jsonOk("""{"unexpected": "shape"}"""))
    server.enqueue(jsonOk(ONE_LOADED_MODEL_BODY))

    val out = service.probe()

    assertTrue(out.daemonReachable)
    assertTrue(out.availableModels.isEmpty())
    // /api/ps still parses correctly even when /api/tags surprised us.
    assertEquals(1, out.loadedModels.size)
  }

  @Test
  fun `ps body without models array yields empty loaded models`() {
    server.enqueue(jsonOk(TWO_TAGS_BODY))
    server.enqueue(jsonOk("""{"unexpected": "shape"}"""))

    val out = service.probe()

    assertTrue(out.daemonReachable)
    assertEquals(2, out.availableModels.size)
    assertTrue(out.loadedModels.isEmpty())
  }

  @Test
  fun `loaded model without expires_at or size_vram parses with nulls`() {
    server.enqueue(jsonOk(TWO_TAGS_BODY))
    server.enqueue(
      jsonOk(
        """
        {"models": [{"name": "qwen2.5:3b"}]}
        """
          .trimIndent()
      )
    )

    val out = service.probe()

    assertEquals(1, out.loadedModels.size)
    assertNull(out.loadedModels[0].expiresAt)
    assertNull(out.loadedModels[0].sizeVramBytes)
  }

  @Test
  fun `unparseable expires_at degrades to null instead of crashing`() {
    server.enqueue(jsonOk(TWO_TAGS_BODY))
    server.enqueue(
      jsonOk(
        """
        {"models": [{"name": "qwen2.5:3b", "expires_at": "not-a-date", "size_vram": 1}]}
        """
          .trimIndent()
      )
    )

    val out = service.probe()

    assertEquals(1, out.loadedModels.size)
    assertNull(out.loadedModels[0].expiresAt)
    assertEquals(1L, out.loadedModels[0].sizeVramBytes)
  }

  // ---------------------------------------------------------------------- unloadModel

  @Test
  fun `unloadModel posts keep_alive zero then re-probes and returns the fresh snapshot`() {
    // Three calls expected on the wire : (1) the unload itself, (2) /api/tags re-probe,
    // (3) /api/ps re-probe. The re-probe is what guarantees the panel sees the daemon state
    // *after* the unload took effect, in a single round-trip.
    server.enqueue(jsonOk("""{"model": "qwen2.5:3b", "done": true}"""))
    server.enqueue(jsonOk(TWO_TAGS_BODY))
    server.enqueue(jsonOk("""{"models": []}""")) // VRAM now empty after the unload

    val out = service.unloadModel("qwen2.5:3b")

    assertTrue(out.daemonReachable)
    assertTrue(out.loadedModels.isEmpty())
    assertEquals(2, out.availableModels.size)

    // Verify the unload payload — the keep_alive: 0 is the whole point of this method.
    val unloadRequest = server.takeRequest()
    assertEquals("/api/chat", unloadRequest.path)
    assertEquals("POST", unloadRequest.method)
    val unloadBody = unloadRequest.body.readUtf8()
    assertTrue(unloadBody.contains("\"keep_alive\":0"), "unload body must carry keep_alive: 0")
    assertTrue(unloadBody.contains("\"model\":\"qwen2.5:3b\""), "unload body must carry the model")
  }

  @Test
  fun `unloadModel surfaces 404 from Ollama as a model-not-pulled message`() {
    // 404 from /api/chat means Ollama doesn't have the model pulled — we want a useful hint
    // surfaced to the panel, not the generic "HTTP 404" string.
    server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error": "model not found"}"""))

    val out = service.unloadModel("mistral:7b")

    assertFalse(out.daemonReachable)
    assertNotNull(out.errorMessage)
    assertTrue(
      out.errorMessage!!.contains("not pulled locally"),
      "expected hint about pull, got '${out.errorMessage}'",
    )
    assertTrue(out.errorMessage!!.contains("mistral:7b"))
  }

  @Test
  fun `unloadModel with blank model short-circuits to a plain probe`() {
    // Defensive — a stale form binding that sends an empty string should not POST
    // anything to the daemon. The only call observed is the re-probe pair.
    server.enqueue(jsonOk(TWO_TAGS_BODY))
    server.enqueue(jsonOk("""{"models": []}"""))

    val out = service.unloadModel("")

    assertTrue(out.daemonReachable)
    // No /api/chat request hit the wire — the first request is the /api/tags probe.
    assertEquals("/api/tags", server.takeRequest().path)
  }

  @Test
  fun `unloadModel surfaces unreachable daemon as fail-soft`() {
    server.shutdown()

    val out = service.unloadModel("qwen2.5:3b")

    assertFalse(out.daemonReachable)
    assertNotNull(out.errorMessage)
  }

  // ---------------------------------------------------------------------- helpers

  private fun jsonOk(body: String): MockResponse =
    MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

  companion object {
    // Reverse alphabetical on purpose to verify the service sorts the result.
    private val TWO_TAGS_BODY =
      """
      {
        "models": [
          {"name": "qwen2.5:3b", "size": 1932000000},
          {"name": "llama3.2:3b", "size": 2019000000}
        ]
      }
      """
        .trimIndent()

    private val ONE_LOADED_MODEL_BODY =
      """
      {
        "models": [
          {
            "name": "qwen2.5:3b",
            "size_vram": 2008000000,
            "expires_at": "2026-05-08T15:30:00Z"
          }
        ]
      }
      """
        .trimIndent()
  }
}
