import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { PortfolioRepository } from './api/portfolio/portfolio.repository';
import { HttpPortfolioRepository } from './api/portfolio/adapters/portfolio.http';
import { SnapshotRepository } from './api/portfolio/snapshot.repository';
import { HttpSnapshotRepository } from './api/portfolio/adapters/snapshot.http';
import { MarketRepository } from './api/market/market.repository';
import { HttpMarketRepository } from './api/market/adapters/market.http';
import { WatchlistRepository } from './api/watchlist/watchlist.repository';
import { HttpWatchlistRepository } from './api/watchlist/adapters/watchlist.http';
import { NewsRepository } from './api/news/news.repository';
import { HttpNewsRepository } from './api/news/adapters/news.http';
import { ConfigRepository } from './api/config/config.repository';
import { HttpConfigRepository } from './api/config/adapters/config.http';
import { AnalystRepository } from './api/analyst/analyst.repository';
import { HttpAnalystRepository } from './api/analyst/adapters/analyst.http';
import { EarningsRepository } from './api/earnings/earnings.repository';
import { HttpEarningsRepository } from './api/earnings/adapters/earnings.http';
import { OllamaStatusRepository } from './api/analysis/ollama-status.repository';
import { HttpOllamaStatusRepository } from './api/analysis/adapters/ollama-status.http';
import { PromptRepository } from './api/analysis/prompt.repository';
import { HttpPromptRepository } from './api/analysis/adapters/prompt.http';
import { NarrativeFeedbackRepository } from './api/analysis/narrative-feedback.repository';
import { HttpNarrativeFeedbackRepository } from './api/analysis/adapters/narrative-feedback.http';
import { NarrativeObservabilityRepository } from './api/analysis/narrative-observability.repository';
import { HttpNarrativeObservabilityRepository } from './api/analysis/adapters/narrative-observability.http';
import { NarrativeBiasRepository } from './api/analysis/narrative-bias.repository';
import { HttpNarrativeBiasRepository } from './api/analysis/adapters/narrative-bias.http';
import { AuthRepository } from './api/auth/auth.repository';
import { HttpAuthRepository } from './api/auth/adapters/auth.http';
import { ScreenerRepository } from './api/screener/screener.repository';
import { HttpScreenerRepository } from './api/screener/adapters/screener.http';
import { AnnotationRepository } from './local/annotation/annotation.repository';
import { LocalStorageAnnotationRepository } from './local/annotation/adapters/annotation.local';
import { ScreenerFilterRepository } from './local/screener-filter/screener-filter.repository';
import { LocalStorageScreenerFilterRepository } from './local/screener-filter/adapters/screener-filter.local';

/**
 * Wires every port (`*.repository.ts`) to its default adapter. Aligned on the
 * `provide*()` convention shipped by Angular itself (`provideRouter`, `provideHttpClient`)
 * so `app.config.ts` stays a list of `provideX()` calls rather than a flat bag of bindings.
 */
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PortfolioRepository, useClass: HttpPortfolioRepository },
    { provide: SnapshotRepository, useClass: HttpSnapshotRepository },
    { provide: MarketRepository, useClass: HttpMarketRepository },
    { provide: WatchlistRepository, useClass: HttpWatchlistRepository },
    { provide: NewsRepository, useClass: HttpNewsRepository },
    { provide: ConfigRepository, useClass: HttpConfigRepository },
    { provide: AnnotationRepository, useClass: LocalStorageAnnotationRepository },
    { provide: AnalystRepository, useClass: HttpAnalystRepository },
    { provide: ScreenerRepository, useClass: HttpScreenerRepository },
    { provide: ScreenerFilterRepository, useClass: LocalStorageScreenerFilterRepository },
    { provide: EarningsRepository, useClass: HttpEarningsRepository },
    { provide: OllamaStatusRepository, useClass: HttpOllamaStatusRepository },
    { provide: PromptRepository, useClass: HttpPromptRepository },
    { provide: NarrativeFeedbackRepository, useClass: HttpNarrativeFeedbackRepository },
    {
      provide: NarrativeObservabilityRepository,
      useClass: HttpNarrativeObservabilityRepository,
    },
    { provide: NarrativeBiasRepository, useClass: HttpNarrativeBiasRepository },
    { provide: AuthRepository, useClass: HttpAuthRepository },
  ]);
}
