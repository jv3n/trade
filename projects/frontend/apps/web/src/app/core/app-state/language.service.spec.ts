/**
 * Tests on [LanguageService] — now backed by the **user** (via [AuthService.currentUser]) rather
 * than localStorage. What we pin :
 *
 * - **Derivation** — the applied language is the user's `language`, or the browser locale when
 *   there is no user (jsdom defaults `navigator.language` to `en-US` → `'en'`).
 * - **Boot sync** — the constructor sets `<html lang>` synchronously from the resolved value.
 * - **set()** — delegates to [AuthService.updatePreferences] (no localStorage) and the resolved
 *   language reflects the change once the (stubbed) backend round-trip updates `currentUser`.
 * - **SSR safety** — on the server platform no `<html lang>` write happens (default `'fr'`).
 * - **A failed save is said out loud** (#311) — since the locale is fixed at start-up, a language
 *   change reloads the page ; when the save fails nothing moves at all, so the click would read as
 *   a dead button without the snackbar.
 */
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast } from '@portfolioai/ui';
import { Observable, of, throwError } from 'rxjs';
import { CurrentUser, PreferencesUpdate } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';
import { LanguageService } from './language.service';

function fakeAuth(initial: CurrentUser | null, fails = false) {
  const user = signal<CurrentUser | null>(initial);
  const calls: PreferencesUpdate[] = [];
  const stub = {
    currentUser: user.asReadonly(),
    updatePreferences(prefs: PreferencesUpdate): Observable<void> {
      calls.push(prefs);
      if (fails) return throwError(() => new Error('nope'));
      user.update((u) => (u ? { ...u, ...prefs } : u));
      return of(undefined);
    },
  };
  return { stub, calls };
}

function makeUser(language?: 'fr' | 'en'): CurrentUser {
  return { email: 'u@example.com', displayName: null, role: 'USER', language };
}

function setup(
  initial: CurrentUser | null,
  platform: 'browser' | 'server' = 'browser',
  options: { failing?: boolean } = {},
) {
  const { stub, calls } = fakeAuth(initial, options.failing);
  const errors: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService({ lang: 'fr' }),
      { provide: AuthService, useValue: stub },
      { provide: StbToast, useValue: { error: (m: string) => errors.push(m) } },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return { service: TestBed.inject(LanguageService), calls, errors };
}

describe('LanguageService', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('lang');
  });

  it('derives the language from the current user', () => {
    const { service } = setup(makeUser('en'));
    expect(service.lang()).toBe('en');
  });

  it('falls back to the browser locale when there is no user (jsdom → en)', () => {
    const { service } = setup(null);
    expect(service.lang()).toBe('en');
  });

  it('writes <html lang> at construction from the resolved value', () => {
    setup(makeUser('en'));
    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });

  it('set() persists via AuthService.updatePreferences and the resolved language follows', () => {
    const { service, calls } = setup(makeUser('fr'));

    service.set('en');

    expect(calls).toEqual([{ language: 'en' }]);
    expect(service.lang()).toBe('en');
  });

  it('says so when the language could not be saved', () => {
    const { service, errors } = setup(makeUser('fr'), 'browser', { failing: true });

    service.set('en');

    expect(errors).toEqual(['language.saveError']);
    expect(service.lang()).toBe('fr');
  });

  it('asks for nothing when the language picked is the one already applied', () => {
    const { service, calls } = setup(makeUser('fr'));

    service.set('fr');

    expect(calls).toEqual([]);
  });

  it('does not touch the DOM on the server platform', () => {
    setup(makeUser('en'), 'server');
    expect(document.documentElement.getAttribute('lang')).toBeNull();
  });
});
