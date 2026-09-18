/**
 * Tests on [ThemeService] — now backed by the **user** (via [AuthService.currentUser]) rather than
 * localStorage. What we pin :
 *
 * - **Derivation** — the applied theme is the current user's `theme`, or `'dark'` when there is no
 *   user (boot / login page).
 * - **Boot DOM sync** — the constructor writes `<html data-theme>` synchronously (before first
 *   paint) from the resolved value.
 * - **set()** — delegates to [AuthService.updatePreferences] (no localStorage) and the resolved
 *   theme reflects the change once the (stubbed) backend round-trip updates `currentUser`.
 * - **SSR safety** — on the server platform no DOM write happens.
 */
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { CurrentUser, PreferencesUpdate } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';

function fakeAuth(initial: CurrentUser | null) {
  const user = signal<CurrentUser | null>(initial);
  const calls: PreferencesUpdate[] = [];
  const stub = {
    currentUser: user.asReadonly(),
    updatePreferences(prefs: PreferencesUpdate): Observable<void> {
      calls.push(prefs);
      // Mirror the real service : the refreshed user lands on the signal, re-driving the computed.
      user.update((u) => (u ? { ...u, ...prefs } : u));
      return of(undefined);
    },
  };
  return { stub, calls };
}

function makeUser(theme?: 'dark' | 'light'): CurrentUser {
  return { email: 'u@example.com', displayName: null, role: 'USER', theme };
}

function setup(initial: CurrentUser | null, platform: 'browser' | 'server' = 'browser') {
  const { stub, calls } = fakeAuth(initial);
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: stub },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return { service: TestBed.inject(ThemeService), calls };
}

describe('ThemeService', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('derives the theme from the current user', () => {
    const { service } = setup(makeUser('light'));
    expect(service.theme()).toBe('light');
  });

  it('defaults to dark when there is no user', () => {
    const { service } = setup(null);
    expect(service.theme()).toBe('dark');
  });

  it('writes <html data-theme> at construction from the resolved value', () => {
    setup(makeUser('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('set() persists via AuthService.updatePreferences and the resolved theme follows', () => {
    const { service, calls } = setup(makeUser('dark'));

    service.set('light');

    expect(calls).toEqual([{ theme: 'light' }]);
    expect(service.theme()).toBe('light');
  });

  it('does not touch the DOM on the server platform', () => {
    setup(makeUser('light'), 'server');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
