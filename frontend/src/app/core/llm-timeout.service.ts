import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigRepository } from './config.repository';

/**
 * Source of truth for the runtime LLM timeout (poll abort + dedup window) on the frontend side.
 * Backend mirror : `OllamaClient.readTimeout` and the two `JobStore.DEDUP_WINDOW_SECONDS` (both
 * `AnalysisJobStore` for portfolio analysis and `TickerNarrativeJobStore` for ticker narratives).
 *
 * **Why a service instead of inline `inject(ConfigRepository).list()` calls** : the two HTTP
 * polling adapters (`analysis.http.ts` and `market.http.ts`) need the timeout at the moment a poll
 * tick fires. Doing a fresh `/api/config` round-trip per tick would be wasteful (the value moves
 * only on a deliberate slider drag in `/settings/configuration`). We prime the signal once at app
 * boot via `provideAppInitializer` and refresh it explicitly when the user saves a new value —
 * subsequent poll ticks read the current signal value with zero network cost.
 *
 * **Default 400** mirrors the YAML default in `application.yml` so a stack that boots without
 * overrides behaves identically to the pre-v1.5 hardcoded constants. The `refresh()` failure
 * branch keeps the current value rather than reverting — a transient network blip during boot
 * shouldn't hand the user a worse default than the one we already had.
 */
@Injectable({ providedIn: 'root' })
export class LlmTimeoutService {
  private readonly repo = inject(ConfigRepository);

  private readonly _seconds = signal(DEFAULT_TIMEOUT_SECONDS);
  readonly seconds = this._seconds.asReadonly();

  /** Convenience accessor for the polling code that thinks in milliseconds. */
  millis(): number {
    return this._seconds() * MILLIS_PER_SECOND;
  }

  /** Re-fetches the config list and updates the signal from the `llm.timeout-seconds` entry. */
  async refresh(): Promise<void> {
    try {
      const entries = await firstValueFrom(this.repo.list());
      const entry = entries.find((e) => e.key === TIMEOUT_KEY);
      const parsed = entry?.currentValue ? Number(entry.currentValue) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        this._seconds.set(parsed);
      }
    } catch {
      // Boot-time network blip — keep whatever value the signal already holds (defaults to
      // DEFAULT_TIMEOUT_SECONDS on the first call). The page re-tries on next save.
    }
  }
}

const TIMEOUT_KEY = 'llm.timeout-seconds';
const DEFAULT_TIMEOUT_SECONDS = 400;
const MILLIS_PER_SECOND = 1000;
