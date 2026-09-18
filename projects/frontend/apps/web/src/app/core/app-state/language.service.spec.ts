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
 */
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { CurrentUser, PreferencesUpdate } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';
import { LanguageService } from './language.service';

function fakeAuth(initial: CurrentUser | null) {
  const user = signal<CurrentUser | null>(initial);
  const calls: PreferencesUpdate[] = [];
  const stub = {
    currentUser: user.asReadonly(),
    updatePreferences(prefs: PreferencesUpdate): Observable<void> {
      calls.push(prefs);
      user.update((u) => (u ? { ...u, ...prefs } : u));
      return of(undefined);
    },
  };
  return { stub, calls };
}

function makeUser(language?: 'fr' | 'en'): CurrentUser {
  return { email: 'u@example.com', displayName: null, role: 'USER', language };
}

function setup(initial: CurrentUser | null, platform: 'browser' | 'server' = 'browser') {
  const { stub, calls } = fakeAuth(initial);
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService({ lang: 'fr' }),
      { provide: AuthService, useValue: stub },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return { service: TestBed.inject(LanguageService), calls };
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

  it('does not touch the DOM on the server platform', () => {
    setup(makeUser('en'), 'server');
    expect(document.documentElement.getAttribute('lang')).toBeNull();
  });
});
