/**
 * Tests on [ThemeService] — focus on the SSR-safety wrap (the only non-trivial logic) and the
 * browser-side localStorage round-trip. The toggle / set methods are pure signal updates and don't
 * deserve their own tests.
 *
 * What we pin :
 * - **Server platform** — instantiation does not throw despite `document` / `localStorage` being
 *   undefined in Node. Default is `'dark'` so SSR renders a deterministic page. No side-effect
 *   reaches a browser global.
 * - **Browser platform** — `loadInitial` honours a saved `'light'` / `'dark'` value ; `set()` and
 *   `toggle()` write both `<html data-theme>` and `localStorage` on each call.
 * - **Corrupt localStorage** — an unrelated string in `portfolioai.theme` falls back to `'dark'`
 *   rather than crashing.
 */
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'portfolioai.theme';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  describe('server platform (SSR safety)', () => {
    it('instantiates without touching document or localStorage when PLATFORM_ID is server', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
      });
      const service = TestBed.inject(ThemeService);

      // Default is dark and no side-effect leaked to the document — a real SSR pass would have
      // crashed on `document.documentElement` if the guard was missing.
      expect(service.theme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('toggle works in-memory on the server platform without writing localStorage', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
      });
      const service = TestBed.inject(ThemeService);

      service.toggle();
      expect(service.theme()).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('browser platform', () => {
    it('hydrates the theme from localStorage on init', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
      });
      const service = TestBed.inject(ThemeService);

      expect(service.theme()).toBe('light');
    });

    it('falls back to dark when localStorage holds an unrelated value', () => {
      localStorage.setItem(STORAGE_KEY, 'sepia');
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
      });
      const service = TestBed.inject(ThemeService);

      expect(service.theme()).toBe('dark');
    });

    it('writes the new theme to document and localStorage when toggled', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
      });
      const service = TestBed.inject(ThemeService);

      service.set('light');

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });
  });
});
