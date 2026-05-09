package com.portfolioai.analysis.application.dto

import java.time.Instant

/**
 * Snapshot of the local Ollama daemon, surfaced on `/settings/configuration > LLM`.
 *
 * Designed to fail-soft : an unreachable daemon does NOT throw a 503 — it returns `daemonReachable:
 * false` with the upstream error in [errorMessage]. The panel reads `(reachable, latencyMs,
 * loadedModels, availableModels)` and renders a green/red chip without ever putting the page in an
 * error state. That mirrors the rest of the dossier philosophy : a degraded panel is better than a
 * blocking error.
 */
data class OllamaStatusDto(
  val daemonReachable: Boolean,
  val baseUrl: String,
  val latencyMs: Long?,
  val loadedModels: List<LoadedModelDto>,
  val availableModels: List<String>,
  val errorMessage: String?,
)

/**
 * One model currently held in VRAM by the Ollama daemon. [expiresAt] is when Ollama will unload the
 * model from VRAM if no further request comes in (idle timeout, default 5 min). The frontend
 * computes a countdown from that field.
 */
data class LoadedModelDto(val name: String, val expiresAt: Instant?, val sizeVramBytes: Long?)
