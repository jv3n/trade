import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OllamaStatus, OllamaStatusRepository } from './ollama-status.repository';

/**
 * Source of truth for the local Ollama daemon snapshot, polled by the panel on
 * `/settings/configuration > LLM`.
 *
 * The signal holds the latest [OllamaStatus] (or `null` until the first refresh completes). The
 * panel consumes this signal directly — every value change re-renders the daemon chip, latency,
 * loaded-models list, etc.
 *
 * **Polling lifecycle** : the panel calls [startPolling] when it mounts and [stopPolling] when it
 * unmounts. The interval ticker re-fetches every [intervalMs] (default 10 s — fast enough to feel
 * live, slow enough not to thrash the daemon during a narrative generation). A failed fetch keeps
 * the previous value rather than wiping it — a transient hiccup shouldn't blank out the panel.
 *
 * The fail-soft contract is shared with the backend probe : the HTTP call always returns 200 with
 * `daemonReachable: false` on daemon trouble, so this service never has to differentiate
 * "network error" from "Ollama is down". A genuine network error (backend unreachable) is the
 * only branch that lands in the catch — the previous signal value persists.
 */
@Injectable({ providedIn: 'root' })
export class OllamaStatusService {
  private readonly repo = inject(OllamaStatusRepository);

  private readonly _status = signal<OllamaStatus | null>(null);
  readonly status = this._status.asReadonly();

  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Re-fetch the snapshot. Safe to call from outside the polling loop (e.g. manual Refresh button). */
  async refresh(): Promise<void> {
    try {
      const next = await firstValueFrom(this.repo.get());
      this._status.set(next);
    } catch {
      // Backend itself unreachable (rare — the daemon-down case lands as 200 with daemonReachable
      // false). Keep the previous value ; the next tick will retry.
    }
  }

  /**
   * Start polling at [intervalMs]. Idempotent — calling twice while polling is active is a no-op.
   * Issues an immediate refresh so the first paint isn't blank.
   */
  startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.intervalHandle !== null) {
      return;
    }
    void this.refresh();
    this.intervalHandle = setInterval(() => {
      void this.refresh();
    }, intervalMs);
  }

  /** Stop polling. Idempotent — safe to call from a component's destroy hook. */
  stopPolling(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Forces the daemon to drop [model] from VRAM. Returns once the backend re-probe completes —
   * the signal is updated with the post-action snapshot, so the panel reflects the freed VRAM
   * without waiting for the next polling tick. Failures keep the previous signal value (same
   * contract as [refresh]) so a flaky daemon doesn't blank the panel mid-action.
   */
  async unload(model: string): Promise<void> {
    try {
      const next = await firstValueFrom(this.repo.unload(model));
      this._status.set(next);
    } catch {
      // Backend itself unreachable. The next polling tick will update the signal.
    }
  }

  /**
   * Tells the daemon to pull [model] from the registry. Blocks 1-3 min in real usage (the
   * backend uses `stream: false` and the request only returns once the download completes).
   * Returns the post-pull snapshot — `model` lands in `availableModels`. Failures bubble as
   * a thrown error so the calling dialog can render an inline message ; we deliberately do
   * not swallow here (unlike [unload]) because the user just clicked "Pull" and a silent
   * no-op would leave them staring at a stuck spinner.
   */
  async pull(model: string): Promise<OllamaStatus> {
    const next = await firstValueFrom(this.repo.pull(model));
    this._status.set(next);
    return next;
  }

  /**
   * Removes [model] from the daemon's local cache (frees disk space, drops the entry from
   * `availableModels`). Fast (~10-50 ms) — mirror of [unload] in lifecycle terms : updates the
   * shared signal with the post-action snapshot, swallows transport errors silently (the
   * panel's next polling tick will resync if the call dropped on the wire). The dialog reads
   * the same signal so its "already pulled" chip disappears in the same render pass.
   */
  async delete(model: string): Promise<void> {
    try {
      const next = await firstValueFrom(this.repo.delete(model));
      this._status.set(next);
    } catch {
      // Backend itself unreachable. The next polling tick will update the signal.
    }
  }
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;
