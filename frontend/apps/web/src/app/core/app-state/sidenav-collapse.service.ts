import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

const STORAGE_KEY = 'portfolioai.sidenav-collapsed';

/**
 * Sidenav collapse state (rail vs full-width) — signal-based, persists to localStorage. Same
 * pattern as [ThemeService] / [LanguageService] : single source of truth, mutation site
 * applies the side effect, no `effect()` watching the signal.
 *
 * The lib's `_shell.scss` reads `.ui-sidenav--collapsed` and swaps the width via
 * `--mat-sidenav-container-width`. Consumers bind the class through
 * `[class.ui-sidenav--collapsed]="sidenavCollapse.collapsed()"`.
 *
 * **SSR safety** — `localStorage` is gated on [isPlatformBrowser] so the service can be
 * instantiated server-side without throwing ; the default is `false` (expanded).
 */
@Injectable({ providedIn: 'root' })
export class SidenavCollapseService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly _collapsed = signal<boolean>(this.loadInitial());
  readonly collapsed = this._collapsed.asReadonly();

  toggle(): void {
    this.set(!this._collapsed());
  }

  set(value: boolean): void {
    this._collapsed.set(value);
    this.persist(value);
  }

  private persist(value: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // localStorage unavailable (private mode, quota exceeded); silently ignore
    }
  }

  private loadInitial(): boolean {
    if (!this.isBrowser) return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
