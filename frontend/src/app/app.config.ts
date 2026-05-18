import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { provideRepositories } from './core/providers';
import { LlmTimeoutService } from './core/api/analysis/llm-timeout.service';
import { AuthService } from './core/app-state/auth.service';
import { authInterceptor } from './core/http/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless change detection — pas de `zone.js` installé, on rend l'opt-in explicite
    // plutôt que de dépendre du comportement implicite. Toute la state est en `signal()` /
    // `computed()` ; le template re-rend automatiquement quand les signaux qu'il lit changent.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // i18n — translation files live in `public/i18n/<lang>.json` so they are served as static
    // assets at `/i18n/<lang>.json`. Active language is driven by `LanguageService`
    // (signal + localStorage). Default to French (project's primary audience) ; English fallback
    // covers any key not yet translated to FR.
    provideTranslateService({
      lang: 'fr',
      fallbackLang: 'en',
    }),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),
    provideRepositories(),
    // Prime the authenticated user from `/api/me` **before** the first route renders. The
    // `provideAppInitializer` callback returns the Observable from `AuthService.refresh()` ;
    // Angular subscribes and waits for completion before bootstrapping the root component. On a
    // 401 (no session attached), `refresh()` sets the signal to null and completes — the route
    // guards then redirect to `/login` on the first navigation, and the toolbar correctly hides
    // user-specific controls on the very first paint. Without this, the navbar would flash a
    // logged-out state for a tick even on a valid session, and route guards would race against
    // the auth lookup.
    provideAppInitializer(() => inject(AuthService).refresh()),
    // Prime the LLM timeout from `/api/config` before the first poll fires. Without this, the
    // first portfolio analysis or narrative request would use the in-memory default (400 s) even
    // if the user has set a different value via /settings/configuration — the override would only
    // kick in after the first manual page reload of /settings. We don't gate this on auth because
    // `/api/config` is admin-only and a USER won't reach it — the 401 is caught by the
    // interceptor and the timeout falls back to the default, which is the same shape as a
    // first-clone fresh boot.
    provideAppInitializer(() => inject(LlmTimeoutService).refresh()),
    // Register the PortfolioAI brand mark so any template can use `<mat-icon svgIcon="portfolioai">`.
    // Loaded once at boot ; MatIconRegistry caches the SVG so subsequent uses don't re-fetch.
    provideAppInitializer(() => {
      inject(MatIconRegistry).addSvgIcon(
        'portfolioai',
        inject(DomSanitizer).bypassSecurityTrustResourceUrl('img/logo/logo.svg'),
      );
    }),
  ],
};
