/**
 * Tests on [ThemeService] — backed by the **user** (via [AuthService.currentUser]) rather than
 * localStorage. What we pin :
 *
 * - **Derivation** — the chosen theme is the current user's, or `'system'` when there is no user
 *   (boot / login page).
 * - **`system`** (#201) — resolves against `prefers-color-scheme` and keeps **following** it : a
 *   change of the OS setting flips the app without a reload.
 * - **Boot DOM sync** — the constructor writes `<html data-theme>` synchronously (before first
 *   paint) from the resolved value.
 * - **set()** — delegates to [AuthService.updatePreferences] (no localStorage) and the resolved
 *   theme reflects the change once the (stubbed) backend round-trip updates `currentUser`.
 * - **SSR safety** — on the server platform no DOM write happens.
 */
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { CurrentUser, PreferencesUpdate, Theme } from '../api/auth/auth.repository';
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

function makeUser(theme?: Theme): CurrentUser {
  return { email: 'u@example.com', displayName: null, role: 'USER', theme };
}

/**
 * Controllable `prefers-color-scheme`. jsdom answers `matches: false` to every query and never
 * emits, so the OS-follows-along behaviour can only be tested against a stub we can flip.
 */
function stubMatchMedia(prefersDark: boolean) {
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches: prefersDark,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.push(listener),
    removeEventListener: () => undefined,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    /** Simulates the OS switching its light / dark setting. */
    switchTo(dark: boolean) {
      mql.matches = dark;
      listeners.forEach((l) => l({ matches: dark } as MediaQueryListEvent));
    },
  };
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
    stubMatchMedia(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('derives the chosen theme from the current user', () => {
    const { service } = setup(makeUser('light'));
    expect(service.theme()).toBe('light');
    expect(service.resolved()).toBe('light');
  });

  it('defaults to following the system when there is no user', () => {
    const { service } = setup(null);
    expect(service.theme()).toBe('system');
  });

  it('system resolves against prefers-color-scheme', () => {
    stubMatchMedia(false); // the OS asks for light
    const { service } = setup(makeUser('system'));

    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('system keeps following the OS — no reload needed', () => {
    const os = stubMatchMedia(false);
    const { service } = setup(makeUser('system'));
    expect(service.resolved()).toBe('light');

    os.switchTo(true); // sunset

    expect(service.resolved()).toBe('dark');
  });

  it('an explicit choice ignores the OS', () => {
    const os = stubMatchMedia(false);
    const { service } = setup(makeUser('light'));

    os.switchTo(true); // the OS goes dark — the user asked for light, and light it stays

    expect(service.resolved()).toBe('light');
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
