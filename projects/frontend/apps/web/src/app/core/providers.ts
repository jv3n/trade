import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AccountRepository } from './api/account/account.repository';
import { HttpAccountRepository } from './api/account/adapters/account.http';
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
import { HttpStatsRepository } from './api/stats/adapters/stats.http';
import { StatsRepository } from './api/stats/stats.repository';

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
    { provide: LexiconRepository, useClass: HttpLexiconRepository },
  ]);
}
