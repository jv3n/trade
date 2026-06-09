import { Observable } from 'rxjs';

export type Role = 'ADMIN' | 'USER';

/** UI preference value types — persisted per-user, mirror of the backend `app_user` columns. */
export type Theme = 'dark' | 'light';
export type Language = 'fr' | 'en';

/**
 * The shape returned by `GET /api/me` — what the SPA needs to render the navbar (email +
 * optional display name), gate admin-only routes (role), and apply the user's UI preferences
 * ([theme] + [language]). Mirror of the backend `CurrentUserDto`.
 *
 * [theme] / [language] are typed optional so the `?? default` fallback in `ThemeService` /
 * `LanguageService` covers both the unauthenticated case (no user at all) and any older payload
 * uniformly — the live backend always populates them.
 */
export interface CurrentUser {
  email: string;
  displayName: string | null;
  role: Role;
  theme?: Theme;
  language?: Language;
}

/** Partial preference update sent to `PUT /api/me/preferences` — only the changed knob. */
export interface PreferencesUpdate {
  theme?: Theme;
  language?: Language;
}

/**
 * Port — authentication introspection + logout.
 *
 * `getCurrentUser()` calls `GET /api/me` and resolves to the authenticated user. The backend
 * returns HTTP 401 when no session is attached ; the adapter surfaces that as an
 * [HttpErrorResponse] (status 401), which [AuthService] catches explicitly to set the signal to
 * null. Other errors (5xx, network) propagate so callers can decide.
 *
 * `logout()` POSTs `/logout` (the handler Spring Security wires automatically). The backend
 * invalidates the session, the response clears the `JSESSIONID` cookie. We don't expect a body —
 * the call returns `void`.
 *
 * Both methods rely on the session cookie being attached to the request ; the dev-server proxy
 * (`proxy.conf.js`) forwards `/api/**`, `/oauth2/**` and `/login/**` to the backend with
 * `changeOrigin: true` so the browser sees cookies as same-origin and includes them
 * automatically.
 */
export abstract class AuthRepository {
  abstract getCurrentUser(): Observable<CurrentUser>;
  abstract logout(): Observable<void>;
  /** `PUT /api/me/preferences` — persists theme / language on the user, returns the refreshed user. */
  abstract updatePreferences(prefs: PreferencesUpdate): Observable<CurrentUser>;
}
