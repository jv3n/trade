import { Injectable, PLATFORM_ID, signal, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'portfolioai.theme';

/**
 * Theme toggle (dark / light) — signal-based, persists to localStorage and mirrors the active
 * choice onto `<html data-theme="…">` so the global SCSS can branch on it.
 *
 * **SSR safety** — `document` and `localStorage` are browser-only globals. We gate every access on
 * [isPlatformBrowser] (resolved from [PLATFORM_ID]) so server-side rendering can construct the
 * service without throwing. The runtime cost is one identity check ; the readability cost is one
 * extra line per side-effect.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly _theme = signal<Theme>(this.loadInitial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    effect(() => {
      const t = this._theme();
      if (!this.isBrowser) return;
      document.documentElement.setAttribute('data-theme', t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        // localStorage unavailable (private mode, quota exceeded, etc.); silently ignore
      }
    });
  }

  toggle(): void {
    this._theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  set(theme: Theme): void {
    this._theme.set(theme);
  }

  private loadInitial(): Theme {
    if (!this.isBrowser) return 'dark';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  }
}
