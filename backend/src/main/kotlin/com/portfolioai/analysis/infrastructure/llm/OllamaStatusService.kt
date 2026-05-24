package com.portfolioai.analysis.infrastructure.llm

import com.portfolioai.analysis.application.dto.LoadedModelDto
import com.portfolioai.analysis.application.dto.OllamaStatusDto
import java.net.http.HttpClient
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeParseException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpMethod
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpStatusCodeException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient

/**
 * Probes the local Ollama daemon for the `/settings/configuration > LLM` panel : daemon up/down,
 * latency, models pulled locally, models currently loaded into VRAM with their idle-timeout expiry.
 *
 * **Fail-soft is the contract** : an unreachable daemon returns a `OllamaStatusDto` with
 * `daemonReachable: false` rather than throwing. The panel polls this endpoint every ~10 s while
 * the user is on the LLM section — propagating exceptions to the UI would put the whole settings
 * page in an error state on every transient hiccup, which defeats the purpose (the panel exists
 * precisely to surface daemon trouble in-band).
 *
 * Two upstream calls per probe :
 * - `GET /api/tags` — full list of models pulled locally. Cheap, served from disk.
 * - `GET /api/ps` — models currently held in VRAM, with `expires_at` for the countdown.
 *
 * Both calls share a short read timeout — the user expects the panel to render fast or fail fast.
 * The cold-start tolerance for actual narrative generation lives in [OllamaClient] (`llm.timeout-
 * seconds`, default 400 s) ; that is unrelated to this lightweight probe.
 */
@Service
class OllamaStatusService(
  @Value("\${ollama.base-url:http://localhost:11434}") private val baseUrl: String
) {
  private val log = LoggerFactory.getLogger(javaClass)

  private val rest: RestClient =
    RestClient.builder()
      .baseUrl(baseUrl)
      .requestFactory(
        JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
          )
          .apply { setReadTimeout(Duration.ofSeconds(PROBE_READ_TIMEOUT_SECONDS)) }
      )
      .defaultHeader("Accept", "application/json")
      .build()

  /**
   * Dedicated RestClient for [pullModel] with a far longer read timeout — pulling a multi-GB model
   * takes 1-3 min on an honest network and would blow through the 3 s timeout used for the
   * lightweight probe / unload paths. Built once at construction (no per-call overhead).
   */
  private val pullRest: RestClient =
    RestClient.builder()
      .baseUrl(baseUrl)
      .requestFactory(
        JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
          )
          .apply { setReadTimeout(Duration.ofSeconds(PULL_READ_TIMEOUT_SECONDS)) }
      )
      .defaultHeader("Accept", "application/json")
      .build()

  fun probe(): OllamaStatusDto {
    val started = System.nanoTime()
    return try {
      val available = fetchAvailableModels()
      val loaded = fetchLoadedModels()
      val elapsedMs = (System.nanoTime() - started) / NANOS_PER_MILLI
      OllamaStatusDto(
        daemonReachable = true,
        baseUrl = baseUrl,
        latencyMs = elapsedMs,
        loadedModels = loaded,
        availableModels = available,
        errorMessage = null,
      )
    } catch (e: ResourceAccessException) {
      log.debug("Ollama probe unreachable : {}", e.message)
      unreachable("Unreachable : ${e.message?.take(MAX_ERROR_LENGTH)}")
    } catch (e: HttpStatusCodeException) {
      log.debug("Ollama probe HTTP {} : {}", e.statusCode, e.message)
      unreachable("HTTP ${e.statusCode.value()} from Ollama")
    }
  }

  /**
   * Forces Ollama to drop [model] from VRAM. Implemented as a `/api/chat` call with `keep_alive: 0`
   * — Ollama doesn't expose a dedicated "unload" endpoint, but this is the documented pattern to
   * evict a model immediately rather than waiting for the idle timeout.
   *
   * Use cases : (a) the user wants to switch to a heavier model and free VRAM right away, (b) the
   * user wants to force a cold-start to compare latency. The call returns ~10 ms after Ollama drops
   * the weights — the panel's next probe (or the immediate re-probe we trigger here) will show 0
   * loaded models for that name.
   *
   * Fail-soft contract identical to [probe] : a daemon hiccup never bubbles a 503 ; instead the
   * snapshot returned to the UI carries `daemonReachable: false`. The panel renders the chip
   * accordingly without putting the page in error state.
   */
  fun unloadModel(model: String): OllamaStatusDto {
    if (model.isBlank()) return probe()
    return try {
      rest
        .post()
        .uri("/api/chat")
        .header("Content-Type", "application/json")
        .body(
          mapOf(
            "model" to model,
            "messages" to emptyList<Any>(),
            "keep_alive" to 0,
            "stream" to false,
          )
        )
        .retrieve()
        .body(Map::class.java)
      probe()
    } catch (e: ResourceAccessException) {
      log.debug("Ollama unload unreachable for model={} : {}", model, e.message)
      unreachable("Unreachable : ${e.message?.take(MAX_ERROR_LENGTH)}")
    } catch (e: HttpStatusCodeException) {
      // 404 from Ollama means "this model isn't pulled locally" — surface that instead of the
      // generic message so the panel can show a useful hint rather than a cryptic code.
      log.debug("Ollama unload HTTP {} for model={} : {}", e.statusCode, model, e.message)
      val message =
        if (e.statusCode.value() == HTTP_NOT_FOUND) "Model not pulled locally : $model"
        else "HTTP ${e.statusCode.value()} from Ollama"
      unreachable(message)
    }
  }

  /**
   * Pulls [name] from the Ollama registry (via `POST /api/pull` with `stream: false` so the
   * response only lands once the download completed). Returns the freshly re-probed snapshot so the
   * panel sees the new model in `availableModels` in a single round-trip — no follow-up `GET
   * /llm/status` needed.
   *
   * **Blocking** : with `stream: false` the request thread sits idle for the duration of the
   * download (1-3 min for a typical ~4 GB model). Acceptable single-user (one concurrent pull at
   * most), to revisit if Phase 5 turns this into a multi-user surface.
   *
   * Fail-soft contract identical to [probe] / [unloadModel] : a daemon hiccup never bubbles a 503 ;
   * instead the snapshot returned to the UI carries `daemonReachable: false` with the cause in
   * `errorMessage`. The panel renders the chip accordingly without putting the page in error state.
   * Blank input short-circuits to a plain probe — no point posting an empty `name` and waiting for
   * Ollama to reject it.
   */
  fun pullModel(name: String): OllamaStatusDto {
    if (name.isBlank()) return probe()
    return try {
      pullRest
        .post()
        .uri("/api/pull")
        .header("Content-Type", "application/json")
        // `model` is the canonical field on /api/pull and /api/delete ; `name` is documented as
        // deprecated. Aligns with [unloadModel] which already speaks `model`. See
        // https://github.com/ollama/ollama/blob/main/docs/api.md#pull-a-model
        .body(mapOf("model" to name, "stream" to false))
        .retrieve()
        .body(Map::class.java)
      probe()
    } catch (e: ResourceAccessException) {
      log.debug("Ollama pull unreachable for name={} : {}", name, e.message)
      unreachable("Unreachable : ${e.message?.take(MAX_ERROR_LENGTH)}")
    } catch (e: HttpStatusCodeException) {
      log.debug("Ollama pull HTTP {} for name={} : {}", e.statusCode, name, e.message)
      // Ollama returns 500 with `{"error": "model 'foo' not found"}` for unknown names today.
      // Should the upstream API ever align on 404 for that case (consistent with /api/show and
      // /api/delete), surface a friendlier hint — the pull-dialog reads this verbatim and "model
      // not in the Ollama registry" is more actionable than "HTTP 404 from Ollama" for the user
      // who's trying to figure out why their typed name didn't resolve. Mirrors the
      // [unloadModel] / [deleteModel] 404 branch.
      val message =
        if (e.statusCode.value() == HTTP_NOT_FOUND) "Model not in the Ollama registry : $name"
        else "HTTP ${e.statusCode.value()} from Ollama"
      unreachable(message)
    }
  }

  /**
   * Deletes [name] from the Ollama daemon's local cache (`DELETE /api/delete`). Frees disk space
   * and removes the entry from `availableModels`. Re-probe + return the fresh snapshot so the
   * panel + dialog re-render in one round-trip.
   *
   * **Fast** : Ollama's delete is essentially a filesystem unlink, ~10-50 ms in practice. No
   * long-timeout RestClient needed — the standard probe `rest` is fine.
   *
   * Fail-soft contract identical to [unloadModel] / [pullModel]. 404 from upstream means the model
   * wasn't pulled in the first place — surfaced as a not-pulled-locally hint rather than a generic
   * HTTP code, mirroring `unloadModel`.
   */
  fun deleteModel(name: String): OllamaStatusDto {
    if (name.isBlank()) return probe()
    return try {
      rest
        .method(HttpMethod.DELETE)
        .uri("/api/delete")
        .header("Content-Type", "application/json")
        // `model` is the canonical field — see [pullModel] for the same rationale.
        .body(mapOf("model" to name))
        .retrieve()
        .toBodilessEntity()
      probe()
    } catch (e: ResourceAccessException) {
      log.debug("Ollama delete unreachable for name={} : {}", name, e.message)
      unreachable("Unreachable : ${e.message?.take(MAX_ERROR_LENGTH)}")
    } catch (e: HttpStatusCodeException) {
      log.debug("Ollama delete HTTP {} for name={} : {}", e.statusCode, name, e.message)
      val message =
        if (e.statusCode.value() == HTTP_NOT_FOUND) "Model not pulled locally : $name"
        else "HTTP ${e.statusCode.value()} from Ollama"
      unreachable(message)
    }
  }

  private fun fetchAvailableModels(): List<String> {
    @Suppress("UNCHECKED_CAST")
    val body =
      rest.get().uri("/api/tags").retrieve().body(Map::class.java) as? Map<*, *>
        ?: return emptyList()
    val models = body["models"] as? List<*> ?: return emptyList()
    return models.mapNotNull { (it as? Map<*, *>)?.get("name") as? String }.sorted()
  }

  private fun fetchLoadedModels(): List<LoadedModelDto> {
    @Suppress("UNCHECKED_CAST")
    val body =
      rest.get().uri("/api/ps").retrieve().body(Map::class.java) as? Map<*, *> ?: return emptyList()
    val models = body["models"] as? List<*> ?: return emptyList()
    return models.mapNotNull { entry ->
      val map = entry as? Map<*, *> ?: return@mapNotNull null
      val name = map["name"] as? String ?: return@mapNotNull null
      LoadedModelDto(
        name = name,
        expiresAt = parseInstantOrNull(map["expires_at"] as? String),
        sizeVramBytes = (map["size_vram"] as? Number)?.toLong(),
      )
    }
  }

  private fun parseInstantOrNull(raw: String?): Instant? {
    if (raw.isNullOrBlank()) return null
    return try {
      Instant.parse(raw)
    } catch (e: DateTimeParseException) {
      log.debug("Could not parse Ollama expires_at='{}' : {}", raw, e.message)
      null
    }
  }

  private fun unreachable(message: String): OllamaStatusDto =
    OllamaStatusDto(
      daemonReachable = false,
      baseUrl = baseUrl,
      latencyMs = null,
      loadedModels = emptyList(),
      availableModels = emptyList(),
      errorMessage = message,
    )

  companion object {
    private const val PROBE_READ_TIMEOUT_SECONDS = 3L
    /**
     * 5 min — sized for ~4 GB models on an honest network. Pulling Mistral 7B (~4 GB) takes 1-3 min
     * in practice ; the ceiling adds a buffer for slower links without locking the request thread
     * indefinitely if Ollama hangs upstream.
     */
    private const val PULL_READ_TIMEOUT_SECONDS = 5L * 60
    private const val NANOS_PER_MILLI = 1_000_000L
    private const val MAX_ERROR_LENGTH = 120
    private const val HTTP_NOT_FOUND = 404
  }
}
