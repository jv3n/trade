import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { Theme } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';

export type { Theme };

/** What the app renders once `system` has been resolved. */
export type ResolvedTheme = 'dark' | 'light';

/** Following the OS is the default : the app doesn't decide before the user has said anything. */
const DEFAULT_THEME: Theme = 'system';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Theme — **persisted on the user**, not in localStorage. The chosen value comes from
 * [AuthService.currentUser] (the `theme` field served by `/api/me`), defaulting to `'system'` when
 * there is no user yet (boot, login page). [set] writes the choice through
 * `PUT /api/me/preferences` ; the resulting `currentUser` update re-drives [theme] + the DOM effect.
 *
 * **`system`** (#201) resolves against `prefers-color-scheme` and keeps following it : the media
 * query is *subscribed to*, not merely read, so switching the OS to dark at sunset flips the app
 * without a reload. [resolved] is what actually lands on the DOM.
 *
 * **DOM mirroring** — the resolved value is written onto `<html data-theme="…">` so the global SCSS
 * can branch on it. Applied once synchronously at construction (before first paint) and via an
 * `effect()` on every subsequent change (login, preference update, OS switch). The write is
 * idempotent so the double-apply on boot is harmless.
 *
 * **SSR safety** — `document` / `matchMedia` are browser-only ; both are gated on
 * [isPlatformBrowser] so the server can construct the service without throwing.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly auth = inject(AuthService);

  /** What the OS asks for — kept live by the media-query listener below. */
  private readonly systemPrefersDark = signal(this.readSystemPreference());

  /** The **chosen** theme, `system` included — what the settings page ticks. */
  readonly theme = computed<Theme>(() => this.auth.currentUser()?.theme ?? DEFAULT_THEME);

  /** The theme actually rendered : the choice, or what the OS asks for when it is `system`. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const chosen = this.theme();
    if (chosen !== 'system') return chosen;
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    this.watchSystemPreference();
    this.applyDom(this.resolved());
    effect(() => this.applyDom(this.resolved()));
  }

  /** Persists the choice on the user ; [theme] + the effect re-apply once `currentUser` updates. */
  set(theme: Theme): void {
    this.auth.updatePreferences({ theme }).subscribe();
  }

  private readSystemPreference(): boolean {
    if (!this.isBrowser || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia(DARK_QUERY).matches;
  }

  /**
   * Keeps [systemPrefersDark] in sync with the OS. The listener lives as long as the app does
   * (root-provided service), so there is nothing to tear down.
   */
  private watchSystemPreference(): void {
    if (!this.isBrowser || typeof window.matchMedia !== 'function') return;
    window
      .matchMedia(DARK_QUERY)
      .addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
  }

  private applyDom(theme: ResolvedTheme): void {
    if (!this.isBrowser) return;
    document.documentElement.setAttribute('data-theme', theme);
  }
}
