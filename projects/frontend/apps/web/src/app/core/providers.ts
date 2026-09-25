import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AccountRepository } from './api/account/account.repository';
import { HttpAccountRepository } from './api/account/adapters/account.http';
import { HttpAppInfoRepository } from './api/app-info/adapters/app-info.http';
import { AppInfoRepository } from './api/app-info/app-info.repository';
import { HttpAuthRepository } from './api/auth/adapters/auth.http';
import { AuthRepository } from './api/auth/auth.repository';
import { HttpCandidatesRepository } from './api/candidates/adapters/candidates.http';
import { CandidatesRepository } from './api/candidates/candidates.repository';
import { HttpConfigRepository } from './api/config/adapters/config.http';
import { ConfigRepository } from './api/config/config.repository';
import { HttpForexRepository } from './api/forex/adapters/forex.http';
import { ForexRepository } from './api/forex/forex.repository';
import { HttpJournalRepository } from './api/journal/adapters/journal.http';
import { JournalRepository } from './api/journal/journal.repository';
import { HttpLexiconRepository } from './api/lexicon/adapters/lexicon.http';
import { LexiconRepository } from './api/lexicon/lexicon.repository';
import { HttpPatternsRepository } from './api/patterns/adapters/patterns.http';
import { PatternsRepository } from './api/patterns/patterns.repository';
import { HttpStatsRepository } from './api/stats/adapters/stats.http';
import { StatsRepository } from './api/stats/stats.repository';
import { HttpTradingDayRepository } from './api/trading-day/adapters/trading-day.http';
import { TradingDayRepository } from './api/trading-day/trading-day.repository';

/**
 * Wires every port (`*.repository.ts`) to its default adapter. Aligned on the
 * `provide*()` convention shipped by Angular itself (`provideRouter`, `provideHttpClient`)
 * so `app.config.ts` stays a list of `provideX()` calls rather than a flat bag of bindings.
 */
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AccountRepository, useClass: HttpAccountRepository },
    { provide: ForexRepository, useClass: HttpForexRepository },
    { provide: ConfigRepository, useClass: HttpConfigRepository },
    { provide: AuthRepository, useClass: HttpAuthRepository },
    { provide: JournalRepository, useClass: HttpJournalRepository },
    { provide: CandidatesRepository, useClass: HttpCandidatesRepository },
    { provide: StatsRepository, useClass: HttpStatsRepository },
    { provide: TradingDayRepository, useClass: HttpTradingDayRepository },
    { provide: LexiconRepository, useClass: HttpLexiconRepository },
    { provide: PatternsRepository, useClass: HttpPatternsRepository },
    { provide: AppInfoRepository, useClass: HttpAppInfoRepository },
  ]);
}
