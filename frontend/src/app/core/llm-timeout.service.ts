import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigRepository } from './config.repository';

/**
 * Source of truth for the runtime LLM timeout exposed to the configuration page.
 *
 * **Today's only consumer** — the `/settings/configuration > LLM` card uses [seconds] to render
 * the "estimation max" label next to the slider so the user sees what the value translates to
 * (e.g. "≈ 6 min 40 s") without reloading. The signal is primed at boot via
 * `provideAppInitializer` so the label is correct on first paint, and refreshed on save so the
 * label updates immediately after a slider drag.
 *
 * **Why a service rather than reading `entries()` inline** — a few historical consumers polled the
 * timeout to abort long-running narrative generation requests (Phase 0 portfolio-analysis poll,
 * Phase 1 narrative job poll). Both have been removed : Phase 0 was decommissioned in V6, and the
 * narrative flow migrated to SSE in Phase 2.5. The service stays as a thin signal because the
 * configuration page already depends on it via `provideAppInitializer`, and a future consumer
 * (e.g. a Phase 4 cron orchestrator that wants to honour the same user-facing timeout) can plug in
 * without re-walking `/api/config`.
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
