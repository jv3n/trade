import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject } from '@angular/core';
import { Theme } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';

export type { Theme };

const DEFAULT_THEME: Theme = 'dark';

/**
 * Theme (dark / light) — now **persisted on the user**, not in localStorage. The applied value is
 * derived from [AuthService.currentUser] (the `theme` field served by `/api/me`), defaulting to
 * `'dark'` when there is no user yet (boot, login page). [set] writes the choice through
 * `PUT /api/me/preferences` ; the resulting `currentUser` update re-drives [theme] + the DOM effect.
 *
 * **DOM mirroring** — the active value is written onto `<html data-theme="…">` so the global SCSS
 * can branch on it. Applied once synchronously at construction (before first paint) and via an
 * `effect()` on every subsequent change (login, preference update). The write is idempotent so the
 * double-apply on boot is harmless.
 *
 * **SSR safety** — `document` is browser-only ; the [applyDom] write is gated on [isPlatformBrowser]
 * so the server can construct the service without throwing.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly auth = inject(AuthService);

  /** Resolved theme : the current user's preference, or the default when no user is loaded. */
  readonly theme = computed<Theme>(() => this.auth.currentUser()?.theme ?? DEFAULT_THEME);

  constructor() {
    this.applyDom(this.theme());
    effect(() => this.applyDom(this.theme()));
  }

  /** Persists the choice on the user ; [theme] + the effect re-apply once `currentUser` updates. */
  set(theme: Theme): void {
    this.auth.updatePreferences({ theme }).subscribe();
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private applyDom(theme: Theme): void {
    if (!this.isBrowser) return;
    document.documentElement.setAttribute('data-theme', theme);
  }
}
