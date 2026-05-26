import { Injectable } from '@angular/core';
import { ScreenerFilter } from '../../../api/screener/screener.repository';
import { ScreenerFilterRepository } from '../screener-filter.repository';

/**
 * `localStorage`-backed implementation of [ScreenerFilterRepository]. Single JSON blob under the
 * key `screener-filter:v1` — same shape as the `ScreenerFilter` wire type so the persisted value
 * can be passed straight to the HTTP adapter without remapping. The `:v1` suffix gives us a
 * trivial escape hatch if the filter shape gains a breaking field later (read returns `null` for
 * the old key, defaults kick in).
 *
 * **SSR safety** — the project ships CSR-only today (zoneless Angular 21, no `provideClientHydra-
 * tion`). If SSR ever lands, wrap `localStorage` accesses in `isPlatformBrowser`.
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageScreenerFilterRepository extends ScreenerFilterRepository {
  private static readonly KEY = 'screener-filter:v1';

  load(): ScreenerFilter | null {
    try {
      const raw = localStorage.getItem(LocalStorageScreenerFilterRepository.KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ScreenerFilter>;
      // Defensive : every numeric field must round-trip as a number. If any of them is missing
      // or wrong-typed we treat the blob as corrupt and fall back to defaults rather than
      // hydrating the form with `NaN` / `undefined`.
      if (typeof parsed.gapPctMin !== 'number' || typeof parsed.volumeRatioMin !== 'number') {
        return null;
      }
      return {
        gapPctMin: parsed.gapPctMin,
        volumeRatioMin: parsed.volumeRatioMin,
        marketCapMin: typeof parsed.marketCapMin === 'number' ? parsed.marketCapMin : null,
        marketCapMax: typeof parsed.marketCapMax === 'number' ? parsed.marketCapMax : null,
        exchange: typeof parsed.exchange === 'string' ? parsed.exchange : null,
        sector: typeof parsed.sector === 'string' ? parsed.sector : null,
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
