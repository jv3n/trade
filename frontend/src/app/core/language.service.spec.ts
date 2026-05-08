/**
 * Tests on [LanguageService] — focus on the SSR-safety wrap and the localStorage / browser-locale
 * fallback chain. The toggle / set methods are pure signal updates and don't deserve their own
 * tests.
 *
 * What we pin :
 * - **Server platform** — instantiation does not throw despite `document` / `localStorage` /
 *   `navigator` being undefined in Node. Default is `'fr'` (project's primary audience) so SSR
 *   renders a deterministic page. No side-effect reaches a browser global.
 * - **Browser platform** — `loadInitial` honours a saved `'fr'` / `'en'` value first ; falls back
 *   to the browser locale via `navigator.language` if absent ; defaults to `'en'` for non-`fr-*`
 *   locales.
 * - **Effect side-effects** — both `<html lang>` and `localStorage` are written when the language
 *   changes.
 */
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { LanguageService } from './language.service';

const STORAGE_KEY = 'portfolioai.language';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('lang');
  });

  describe('server platform (SSR safety)', () => {
    it('instantiates without touching document or localStorage when PLATFORM_ID is server', () => {
      TestBed.configureTestingModule({
        providers: [
          provideTranslateService({ lang: 'fr' }),
          { provide: PLATFORM_ID, useValue: 'server' },
        ],
      });
      const service = TestBed.inject(LanguageService);

      // Default is fr (project's primary audience) — and no side-effect leaked. A real SSR pass
      // would have crashed on `document.documentElement` / `navigator.language` if the guard was
      // missing.
      expect(service.lang()).toBe('fr');
      expect(document.documentElement.getAttribute('lang')).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('toggle works in-memory on the server platform without writing localStorage', () => {
      TestBed.configureTestingModule({
        providers: [
          provideTranslateService({ lang: 'fr' }),
          { provide: PLATFORM_ID, useValue: 'server' },
        ],
      });
      const service = TestBed.inject(LanguageService);

      service.toggle();
      expect(service.lang()).toBe('en');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('browser platform', () => {
    it('hydrates the language from localStorage on init', () => {
      localStorage.setItem(STORAGE_KEY, 'en');
      TestBed.configureTestingModule({
        providers: [
          provideTranslateService({ lang: 'fr' }),
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      });
      const service = TestBed.inject(LanguageService);

      expect(service.lang()).toBe('en');
    });

    it('falls back to browser locale when localStorage is empty', () => {
      // jsdom defaults `navigator.language` to `'en-US'` — so a fresh user with no saved choice
      // lands on `'en'`. We don't try to mock `navigator.language` here because jsdom's default is
      // already the path we want to pin.
      TestBed.configureTestingModule({
        providers: [
          provideTranslateService({ lang: 'fr' }),
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      });
      const service = TestBed.inject(LanguageService);

      // navigator.language in jsdom is 'en-US' → starts with 'en' → 'en'
      expect(service.lang()).toBe('en');
    });

    it('writes <html lang> and localStorage when the language changes', () => {
      TestBed.configureTestingModule({
        providers: [
          provideTranslateService({ lang: 'fr' }),
          { provide: PLATFORM_ID, useValue: 'browser' },
        ],
      });
      const service = TestBed.inject(LanguageService);

      service.set('fr');
      // The effect runs synchronously here in test mode (signal-driven, no zone).
      TestBed.tick();

      expect(document.documentElement.getAttribute('lang')).toBe('fr');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('fr');
    });
  });
});
