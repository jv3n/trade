import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { CurrentUser } from '../../core/api/auth/auth.repository';
import { AuthService } from '../../core/app-state/auth.service';
import { Settings } from './settings';

/**
 * Smoke test on the settings shell. The component now injects `AuthService` to gate the
 * admin-only sidenav entries via `auth.isAdmin()` — stubbed here with a signal-backed fake so
 * the test doesn't need to provide the full `AuthRepository` HTTP chain.
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

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        provideAuthStub({ email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
