import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthRepository, CurrentUser } from '../auth.repository';

@Injectable()
export class HttpAuthRepository extends AuthRepository {
  private readonly http = inject(HttpClient);

  getCurrentUser(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>('/api/me');
  }

  logout(): Observable<void> {
    // Spring Security's default logout handler accepts POST and returns either 302 or 200/204.
    // We set `logoutSuccessUrl("/")` server-side which Spring translates to a 302 — but on an
    // XHR call with `Accept: application/json`, Spring's logout chain still returns the redirect
    // by default. The browser would follow silently to `/` (the SPA), which is harmless.
    // We don't need to read any body — `void` matches both 200 and 302.
    return this.http.post<void>('/logout', null);
  }
}
