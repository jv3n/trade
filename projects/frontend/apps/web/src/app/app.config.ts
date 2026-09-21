import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { MatIconRegistry, provideStbMaterial } from '@portfolioai/ui';
import * as Sentry from '@sentry/browser';

import { routes } from './app.routes';
import { AuthService } from './core/app-state/auth.service';
import { authInterceptor } from './core/http/auth.interceptor';
import { provideRepositories } from './core/providers';

/**
 * Forwards Angular's caught unhandled errors to GlitchTip via the Sentry SDK + keeps the default
 * console.error behaviour so errors stay visible to a dev who opens DevTools on a prod URL. This
 * replaces `@sentry/angular`'s `Sentry.createErrorHandler()` factory — we use `@sentry/browser`
 * instead because the Angular-specific package peer-deps cap at Angular 19 and we run on 21.
 *
 * Wired only when `!isDevMode()` in `appConfig.providers` ; dev keeps the default Angular handler
 * so errors stay in the console and don't ship to GlitchTip.
 */
class GlitchtipErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    Sentry.captureException(error);
    console.error(error);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    // No `zone.js` is installed ; the opt-in is explicit rather than implicit.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    // Global GlitchTip ErrorHandler — forwards unhandled exceptions bubbling up from component
    // lifecycles, signal effects, and async handlers to GlitchTip via `Sentry.captureException`.
    // Init lives in `main.ts` (must run before `bootstrapApplication`) ; this provider plugs the
    // captured errors into the Angular DI graph. Skipped in dev so local crashes stay in the
    // browser console.
    ...(isDevMode() ? [] : [{ provide: ErrorHandler, useClass: GlitchtipErrorHandler }]),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Material defaults of the design system : date adapter, no ripples, dense forms, icon font.
    provideStbMaterial(),
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
    // Register the PortfolioAI brand mark so any template can use `<mat-icon svgIcon="portfolioai">`.
    // Loaded once at boot ; MatIconRegistry caches the SVG so subsequent uses don't re-fetch.
    provideAppInitializer(() => {
      // Ligature icon names come from https://fonts.google.com/icons — mapping of the app's icons
      // in `mockup/README.md`.
      inject(MatIconRegistry).addSvgIcon(
        'portfolioai',
        inject(DomSanitizer).bypassSecurityTrustResourceUrl('img/logo/logo.svg'),
      );
    }),
  ],
};
