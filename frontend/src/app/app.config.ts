import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { PortfolioRepository } from './core/portfolio.repository';
import { HttpPortfolioRepository } from './core/adapters/portfolio.http';
import { AnalysisRepository } from './core/analysis.repository';
import { HttpAnalysisRepository } from './core/adapters/analysis.http';
import { SettingsRepository } from './core/settings.repository';
import { HttpSettingsRepository } from './core/adapters/settings.http';
import { SnapshotRepository } from './core/snapshot.repository';
import { HttpSnapshotRepository } from './core/adapters/snapshot.http';
import { MarketRepository } from './core/market.repository';
import { HttpMarketRepository } from './core/adapters/market.http';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless change detection — pas de `zone.js` installé, on rend l'opt-in explicite
    // plutôt que de dépendre du comportement implicite. Toute la state est en `signal()` /
    // `computed()` ; le template re-rend automatiquement quand les signaux qu'il lit changent.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
    // i18n — translation files live in `public/i18n/<lang>.json` so they are served as static
    // assets at `/i18n/<lang>.json`. Active language is driven by `LanguageService`
    // (signal + localStorage). Default to French (project's primary audience) ; English fallback
    // covers any key not yet translated to FR.
    provideTranslateService({
      lang: 'fr',
      fallbackLang: 'en',
    }),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),
    { provide: PortfolioRepository, useClass: HttpPortfolioRepository },
    { provide: AnalysisRepository, useClass: HttpAnalysisRepository },
    { provide: SettingsRepository, useClass: HttpSettingsRepository },
    { provide: SnapshotRepository, useClass: HttpSnapshotRepository },
    { provide: MarketRepository, useClass: HttpMarketRepository },
  ],
};
