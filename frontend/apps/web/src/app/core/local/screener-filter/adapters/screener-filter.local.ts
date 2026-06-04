import { Injectable } from '@angular/core';
import { ScreenerFilter } from '../../../api/screener/screener.repository';
import { ScreenerFilterRepository } from '../screener-filter.repository';

/**
 * `localStorage`-backed implementation of [ScreenerFilterRepository]. Single JSON blob under the
 * key `screener-filter:v2`. The `:v2` suffix gates the Phase 6 ticket (8) breaking change — the
 * filter shape lost `marketCapMin/Max`, `exchange` and `sector` ; any `:v1` blob left over from a
 * previous session is ignored, defaults kick in. Bumping the version is preferred over a runtime
 * migration because single-user / single-device dev means the user re-tunes their floors in 10 s.
 *
 * **SSR safety** — the project ships CSR-only today (zoneless Angular 21, no `provideClientHydra-
 * tion`). If SSR ever lands, wrap `localStorage` accesses in `isPlatformBrowser`.
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageScreenerFilterRepository extends ScreenerFilterRepository {
  private static readonly KEY = 'screener-filter:v2';

  load(): ScreenerFilter | null {
    try {
      const raw = localStorage.getItem(LocalStorageScreenerFilterRepository.KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ScreenerFilter>;
      // Defensive : both numeric fields must round-trip as numbers. If either is missing or
      // wrong-typed we treat the blob as corrupt and fall back to defaults rather than hydrating
      // the form with `NaN` / `undefined`.
      if (typeof parsed.gapPctMin !== 'number' || typeof parsed.volumeRatioMin !== 'number') {
        return null;
      }
      return {
        gapPctMin: parsed.gapPctMin,
        volumeRatioMin: parsed.volumeRatioMin,
      };
    } catch {
      return null;
    }
  }

  save(filter: ScreenerFilter): void {
    try {
      localStorage.setItem(LocalStorageScreenerFilterRepository.KEY, JSON.stringify(filter));
    } catch {
      // localStorage unavailable (private mode, quota) — silently drop. The radar still works
      // in-session, only the cross-reload persistence is lost.
    }
  }
}
