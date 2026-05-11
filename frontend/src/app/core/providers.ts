import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { PortfolioRepository } from './portfolio.repository';
import { HttpPortfolioRepository } from './adapters/portfolio.http';
import { SnapshotRepository } from './snapshot.repository';
import { HttpSnapshotRepository } from './adapters/snapshot.http';
import { MarketRepository } from './market.repository';
import { HttpMarketRepository } from './adapters/market.http';
import { WatchlistRepository } from './watchlist.repository';
import { HttpWatchlistRepository } from './adapters/watchlist.http';
import { NewsRepository } from './news.repository';
import { HttpNewsRepository } from './adapters/news.http';
import { ConfigRepository } from './config.repository';
import { HttpConfigRepository } from './adapters/config.http';
import { AnnotationRepository } from './annotation.repository';
import { LocalStorageAnnotationRepository } from './adapters/annotation.local';
import { AnalystRepository } from './analyst.repository';
import { HttpAnalystRepository } from './adapters/analyst.http';
import { EarningsRepository } from './earnings.repository';
import { HttpEarningsRepository } from './adapters/earnings.http';
import { OllamaStatusRepository } from './ollama-status.repository';
import { HttpOllamaStatusRepository } from './adapters/ollama-status.http';
import { PromptRepository } from './prompt.repository';
import { HttpPromptRepository } from './adapters/prompt.http';
import { NarrativeFeedbackRepository } from './narrative-feedback.repository';
import { HttpNarrativeFeedbackRepository } from './adapters/narrative-feedback.http';

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
    { provide: EarningsRepository, useClass: HttpEarningsRepository },
    { provide: OllamaStatusRepository, useClass: HttpOllamaStatusRepository },
    { provide: PromptRepository, useClass: HttpPromptRepository },
    { provide: NarrativeFeedbackRepository, useClass: HttpNarrativeFeedbackRepository },
  ]);
}
