import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { provideRepositories } from './core/providers';
import { LlmTimeoutService } from './core/api/analysis/llm-timeout.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless change detection — pas de `zone.js` installé, on rend l'opt-in explicite
    // plutôt que de dépendre du comportement implicite. Toute la state est en `signal()` /
    // `computed()` ; le template re-rend automatiquement quand les signaux qu'il lit changent.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
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
    // Prime the LLM timeout from `/api/config` before the first poll fires. Without this, the
    // first portfolio analysis or narrative request would use the in-memory default (400 s) even
    // if the user has set a different value via /settings/configuration — the override would only
    // kick in after the first manual page reload of /settings.
    provideAppInitializer(() => inject(LlmTimeoutService).refresh()),
  ],
};
