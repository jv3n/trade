import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';

import { AppVersion } from '../../core/api/app-info/app-info.model';
import { AppInfoRepository } from '../../core/api/app-info/app-info.repository';
import { CurrentUser } from '../../core/api/auth/auth.repository';
import { AuthService } from '../../core/app-state/auth.service';
import { Settings } from './settings';

/**
 * Smoke test on the settings shell. The component now injects `AuthService` to gate the
 * admin-only sidenav entries via `auth.isAdmin()` — stubbed here with a signal-backed fake so
 * the test doesn't need to provide the full `AuthRepository` HTTP chain.
 *
 * It also pins the deployed version closing the menu (#380) : the release tag, the commit and the
 * build time, a chip naming the environment the backend reports (`local` neutral, `staging`
 * indigo, none in production), nothing when the call fails or the build carries no version.
 */
function provideAuthStub(currentUser: CurrentUser | null) {
  const _currentUser = signal<CurrentUser | null>(currentUser);
  const stub = {
    currentUser: _currentUser.asReadonly(),
    isAuthenticated: () => _currentUser() !== null,
    isAdmin: () => _currentUser()?.role === 'ADMIN',
    refresh: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
    logout: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
    clear: () => undefined,
  };
  return { provide: AuthService, useValue: stub };
}

let appVersion: () => Observable<AppVersion | null>;

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    appVersion = () =>
      of({
        version: 'v2.3.0-rc2',
        commit: '9a4da8b',
        builtAt: new Date(2026, 8, 23, 14, 55),
        environment: 'staging',
      });
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        provideAuthStub({ email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' }),
        { provide: AppInfoRepository, useValue: { version: () => appVersion() } },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('should create', async () => {
    await render();
    expect(component).toBeTruthy();
  });

  it('closes the menu on the running release, its commit, and the staging chip', async () => {
    const page = await render();

    const block = page.querySelector('.subnav-version') as HTMLElement;
    expect(block.textContent).toContain('v2.3.0-rc2');
    expect(block.textContent).toContain('settings.version.detail');
    expect(block.querySelector('.env-tag--staging')).not.toBeNull();
  });

  it('marks a local backend with a neutral chip', async () => {
    appVersion = () =>
      of({
        version: 'v2.3.0-rc2-2-g8d53fd2',
        commit: '8d53fd2',
        builtAt: null,
        environment: 'local',
      });
    const page = await render();

    expect(page.querySelector('.env-tag--local')).not.toBeNull();
  });

  it('carries no chip in production, the normal case', async () => {
    appVersion = () =>
      of({ version: 'v2.3.0', commit: '9a4da8b', builtAt: null, environment: 'prod' });
    const page = await render();

    expect(page.querySelector('.subnav-version')).not.toBeNull();
    expect(page.querySelector('.env-tag')).toBeNull();
  });

  it('shows no version block when the build carries none', async () => {
    appVersion = () => of(null);
    const page = await render();

    expect(page.querySelector('.subnav-version')).toBeNull();
  });

  it('shows no version block when it cannot be read', async () => {
    appVersion = () => throwError(() => new Error('401'));
    const page = await render();

    expect(page.querySelector('.subnav-version')).toBeNull();
  });
});
