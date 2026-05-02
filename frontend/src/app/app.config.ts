import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { PortfolioRepository } from './core/portfolio.repository';
import { HttpPortfolioRepository } from './core/adapters/portfolio.http';
import { AnalysisRepository } from './core/analysis.repository';
import { HttpAnalysisRepository } from './core/adapters/analysis.http';
import { SettingsRepository } from './core/settings.repository';
import { HttpSettingsRepository } from './core/adapters/settings.http';
import { SnapshotRepository } from './core/snapshot.repository';
import { HttpSnapshotRepository } from './core/adapters/snapshot.http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
    { provide: PortfolioRepository, useClass: HttpPortfolioRepository },
    { provide: AnalysisRepository, useClass: HttpAnalysisRepository },
    { provide: SettingsRepository, useClass: HttpSettingsRepository },
    { provide: SnapshotRepository, useClass: HttpSnapshotRepository },
  ],
};
