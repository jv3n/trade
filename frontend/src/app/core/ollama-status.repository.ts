import { Observable } from 'rxjs';

/** One model currently held in VRAM, with the idle-timeout deadline computed by the backend. */
export interface LoadedModel {
  name: string;
  /** ISO-8601 string ; null when the upstream omitted `expires_at` (older Ollama versions). */
  expiresAt: string | null;
  /** Bytes — null when omitted. The UI renders it humanised (`2.0 GB`). */
  sizeVramBytes: number | null;
}

/**
 * Snapshot of the local Ollama daemon as exposed by `GET /api/config/llm/status`.
 *
 * Always returns 200 from the backend even when the daemon is down — the panel reads
 * `daemonReachable` and renders the chip accordingly. Polling that puts the page in error state
 * on every transient hiccup defeats the purpose of having a panel that exists to surface daemon
 * trouble.
 */
export interface OllamaStatus {
  daemonReachable: boolean;
  baseUrl: string;
  latencyMs: number | null;
  loadedModels: LoadedModel[];
  availableModels: string[];
  errorMessage: string | null;
}

/**
 * Port — fetches the Ollama daemon status snapshot and triggers control actions on it.
 *
 * `get` is consumed by [OllamaStatusService] which polls every ~10 s while the LLM section of
 * `/settings/configuration` is mounted. `unload` evicts a named model from VRAM and returns the
 * post-action snapshot in the same response — saves a follow-up `get` round-trip.
 */
export abstract class OllamaStatusRepository {
  abstract get(): Observable<OllamaStatus>;
  abstract unload(model: string): Observable<OllamaStatus>;
}
