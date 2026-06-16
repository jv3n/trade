import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AccountRepository } from './api/account/account.repository';
import { HttpAccountRepository } from './api/account/adapters/account.http';
import { HttpNarrativeBiasRepository } from './api/analysis/adapters/narrative-bias.http';
import { HttpNarrativeFeedbackRepository } from './api/analysis/adapters/narrative-feedback.http';
import { HttpNarrativeObservabilityRepository } from './api/analysis/adapters/narrative-observability.http';
import { HttpOllamaStatusRepository } from './api/analysis/adapters/ollama-status.http';
import { HttpPromptRepository } from './api/analysis/adapters/prompt.http';
import { NarrativeBiasRepository } from './api/analysis/narrative-bias.repository';
import { NarrativeFeedbackRepository } from './api/analysis/narrative-feedback.repository';
import { NarrativeObservabilityRepository } from './api/analysis/narrative-observability.repository';
import { OllamaStatusRepository } from './api/analysis/ollama-status.repository';
import { PromptRepository } from './api/analysis/prompt.repository';
import { HttpAnalystRepository } from './api/analyst/adapters/analyst.http';
import { AnalystRepository } from './api/analyst/analyst.repository';
import { HttpAuthRepository } from './api/auth/adapters/auth.http';
import { AuthRepository } from './api/auth/auth.repository';
import { HttpConfigRepository } from './api/config/adapters/config.http';
import { ConfigRepository } from './api/config/config.repository';
import { HttpEarningsRepository } from './api/earnings/adapters/earnings.http';
import { EarningsRepository } from './api/earnings/earnings.repository';
import { HttpForexRepository } from './api/forex/adapters/forex.http';
import { ForexRepository } from './api/forex/forex.repository';
import { HttpJournalRepository } from './api/journal/adapters/journal.http';
import { JournalRepository } from './api/journal/journal.repository';
import { HttpLexiconRepository } from './api/lexicon/adapters/lexicon.http';
import { LexiconRepository } from './api/lexicon/lexicon.repository';
import { HttpMarketRepository } from './api/market/adapters/market.http';
import { MarketRepository } from './api/market/market.repository';
import { HttpNewsRepository } from './api/news/adapters/news.http';
import { NewsRepository } from './api/news/news.repository';
import { HttpPortfolioRepository } from './api/portfolio/adapters/portfolio.http';
import { HttpSnapshotRepository } from './api/portfolio/adapters/snapshot.http';
import { PortfolioRepository } from './api/portfolio/portfolio.repository';
import { SnapshotRepository } from './api/portfolio/snapshot.repository';
import { HttpScreenerRepository } from './api/screener/adapters/screener.http';
import { ScreenerRepository } from './api/screener/screener.repository';
import { HttpStatsRepository } from './api/stats/adapters/stats.http';
import { StatsRepository } from './api/stats/stats.repository';
import { HttpWatchlistRepository } from './api/watchlist/adapters/watchlist.http';
import { WatchlistRepository } from './api/watchlist/watchlist.repository';
import { LocalStorageAnnotationRepository } from './local/annotation/adapters/annotation.local';
import { AnnotationRepository } from './local/annotation/annotation.repository';

/**
 * Wires every port (`*.repository.ts`) to its default adapter. Aligned on the
 * `provide*()` convention shipped by Angular itself (`provideRouter`, `provideHttpClient`)
 * so `app.config.ts` stays a list of `provideX()` calls rather than a flat bag of bindings.
 */
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AccountRepository, useClass: HttpAccountRepository },
    { provide: ForexRepository, useClass: HttpForexRepository },
    { provide: PortfolioRepository, useClass: HttpPortfolioRepository },
    { provide: SnapshotRepository, useClass: HttpSnapshotRepository },
    { provide: MarketRepository, useClass: HttpMarketRepository },
    { provide: WatchlistRepository, useClass: HttpWatchlistRepository },
    { provide: NewsRepository, useClass: HttpNewsRepository },
    { provide: ConfigRepository, useClass: HttpConfigRepository },
    { provide: AnnotationRepository, useClass: LocalStorageAnnotationRepository },
    { provide: AnalystRepository, useClass: HttpAnalystRepository },
    { provide: ScreenerRepository, useClass: HttpScreenerRepository },
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
    { provide: JournalRepository, useClass: HttpJournalRepository },
    { provide: StatsRepository, useClass: HttpStatsRepository },
    { provide: LexiconRepository, useClass: HttpLexiconRepository },
  ]);
}
