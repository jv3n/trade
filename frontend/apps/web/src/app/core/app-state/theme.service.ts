import { Injectable, PLATFORM_ID, signal, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'portfolioai.theme';

/**
 * Theme toggle (dark / light) — signal-based, persists to localStorage and mirrors the active
 * choice onto `<html data-theme="…">` so the global SCSS can branch on it.
 *
 * **Side effects at the mutation site** — the `apply()` call lives inside [set] (and via [toggle],
 * which delegates to [set]) rather than inside an `effect()` watching the signal. Reasons : the
 * write happens exactly once per user action (an `effect()` also fires on initial signal
 * construction, producing a redundant `localStorage.setItem` echoing the value just read), the
 * flow is testable without `TestBed.tick()` or microtask awaiting, and there is no risk of a
 * reactive feedback loop.
 *
 * **SSR safety** — `document` and `localStorage` are browser-only globals. We gate every access on
 * [isPlatformBrowser] (resolved from [PLATFORM_ID]) so server-side rendering can construct the
 * service without throwing.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly _theme = signal<Theme>(this.loadInitial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    // Initial DOM sync — the `<html data-theme>` attribute must reflect the loaded value at boot,
    // even before any user action. No localStorage write here : the value already came from there.
    this.applyDom(this._theme());
  }

  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this.applyDom(theme);
    this.persist(theme);
  }

  private applyDom(theme: Theme): void {
    if (!this.isBrowser) return;
    document.documentElement.setAttribute('data-theme', theme);
  }

  private persist(theme: Theme): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode, quota exceeded, etc.); silently ignore
    }
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
