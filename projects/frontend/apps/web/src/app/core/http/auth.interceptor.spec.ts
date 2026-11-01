import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../app-state/auth.service';
import { authInterceptor } from './auth.interceptor';

/**
 * The one routing decision the interceptor makes : a session expired mid-way bounces to `/login`.
 * Anything else reaches the caller untouched, and `/api/me` and `/api/config` never bounce — a 401
 * there says nothing about a session gone.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const clear = vi.fn();
  const navigate = vi.fn(() => Promise.resolve(true));

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { clear } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  function answer(url: string, status: number): unknown {
    let received: unknown;
    http.get(url).subscribe({ error: (error: unknown) => (received = error) });
    backend.expectOne(url).flush(null, { status, statusText: 'Refused' });
    return received;
  }

  it('clears the user and goes to /login on a 401 from the API', () => {
    answer('/api/stats', 401);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('still hands the 401 to the caller', () => {
    expect(answer('/api/stats', 401)).toMatchObject({ status: 401 });
  });

  it.each(['/api/me', '/api/config/allowed-emails', '/login/oauth2/code/google'])(
    'leaves a 401 from %s alone',
    (url) => {
      answer(url, 401);

      expect(clear).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it('leaves a 500 to the caller, without moving the user', () => {
    expect(answer('/api/stats', 500)).toMatchObject({ status: 500 });
    expect(navigate).not.toHaveBeenCalled();
  });
});
