import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast } from '@portfolioai/ui';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountRepository } from '../../core/api/account/account.repository';
import { Candidate } from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { JournalRepository } from '../../core/api/journal/journal.repository';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import { StatEntry } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { TodayPage, marketStatusAt } from './today-page';

/**
 * Pins the Today page (#199) — the screen that tells the user where they are in the trading day.
 * Its whole value is the **derived state**, so that is what is pinned :
 *
 * - the **market status** comes from the New York clock, not the browser's ;
 * - the **current step** is the first one that isn't behind us, whatever the day looks like ;
 * - a step is done from the **data** : a reconciled morning, every captured candidate in the
 *   stats sheet, no stat left to complete whatever its day, a trade entered (#337) ;
 * - step 4 splits the stats to complete between the day's and the **overdue** ones, which carry
 *   their date ;
 * - « promote the remaining » **confirms** before creating stats ;
 * - a failing call leaves the page standing — it is the home page, it can't go blank.
 *
 * The clock is frozen on a Friday premarket so the states don't depend on when the suite runs.
 */
describe('TodayPage', () => {
  /** Friday 18 September 2026, 08:30 in New York (12:30 UTC, EDT) — premarket. */
  const FRIDAY_PREMARKET = new Date('2026-09-18T12:30:00Z');

  let candidates: Candidate[];
  let statsToComplete: StatEntry[];
  let todayTrades: TradeEntry[];
  let reconciledToday: boolean;
  let confirmed: boolean;
  let promoteDay: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FRIDAY_PREMARKET);

    candidates = [];
    statsToComplete = [];
    todayTrades = [];
    reconciledToday = false;
    confirmed = true;
    promoteDay = vi.fn(() => of({ promoted: ['BNRG', 'MLGO'], skipped: [] }));

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: AccountRepository,
          useValue: {
            getSummary: () => of(makeAccountSummary()),
            reconciliations: () =>
              of(reconciledToday ? [{ ...makeReconciliation(), valueDate: new Date() }] : []),
            reconcile: () => of(makeReconciliation()),
          } as unknown as AccountRepository,
        },
        {
          provide: CandidatesRepository,
          useValue: {
            listForDate: () => of(candidates),
            promoteDay,
          } as unknown as CandidatesRepository,
        },
        {
          provide: StatsRepository,
          useValue: {
            findAll: () => of(page(statsToComplete)),
            summary: () => of(makeStatSummary()),
          } as unknown as StatsRepository,
        },
        {
          provide: JournalRepository,
          useValue: {
            findAll: () => of(page(todayTrades)),
            summary: () => of(makeJournalSummary()),
          } as unknown as JournalRepository,
        },
        { provide: StbToast, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: () => of(confirmed) } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function setup(): TodayPage {
    const fixture = TestBed.createComponent(TodayPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  // ---------------------------------------------------------------------------
  // Market status — read on the New York clock
  // ---------------------------------------------------------------------------

  it('reads the market status on the New York clock', () => {
    expect(marketStatusAt(new Date('2026-09-18T12:30:00Z'))).toBe('PREMARKET'); // 08:30 NY
    expect(marketStatusAt(new Date('2026-09-18T14:00:00Z'))).toBe('OPEN'); // 10:00 NY
    expect(marketStatusAt(new Date('2026-09-18T21:00:00Z'))).toBe('CLOSED'); // 17:00 NY
    expect(marketStatusAt(new Date('2026-09-18T06:00:00Z'))).toBe('CLOSED'); // 02:00 NY
  });

  it('the weekend is closed, whatever the hour', () => {
    expect(marketStatusAt(new Date('2026-09-19T14:00:00Z'))).toBe('CLOSED'); // Saturday 10:00 NY
  });

  // ---------------------------------------------------------------------------
  // The walk-through
  // ---------------------------------------------------------------------------

  it('a fresh morning puts the reconciliation first and leaves the rest to come', () => {
    const page = setup();

    expect(page.stepStates().reconciliation).toBe('current');
    expect(page.stepStates().candidates).toBe('todo');
    expect(page.stepStates().trades).toBe('todo');
    expect(page.doneCount()).toBe(0);
  });

  it('once the morning is reconciled, the candidates become the current step', () => {
    reconciledToday = true;
    const page = setup();

    expect(page.stepStates().reconciliation).toBe('done');
    expect(page.stepStates().candidates).toBe('current');
  });

  it('captured candidates, all in the sheet, move the day on — the session is still ahead', () => {
    reconciledToday = true;
    candidates = [
      makeCandidate({ promoted: true }),
      makeCandidate({ id: 'c2', ticker: 'BNRG', promoted: true }),
    ];
    // Promoted this morning, so their stats wait for the session : step 4 is not behind us.
    statsToComplete = [makeStat(), makeStat({ id: 's2', ticker: 'BNRG' })];
    const page = setup();

    expect(page.stepStates().candidates).toBe('done');
    expect(page.stepStates().session).toBe('current');
    expect(page.doneCount()).toBe(2);
  });

  // #337 : capturing one candidate was enough, and the promotion hid under step 4.
  it('the candidates step stays current while a candidate has not reached the sheet', () => {
    reconciledToday = true;
    candidates = [makeCandidate({ promoted: true }), makeCandidate({ id: 'c2', promoted: false })];
    const page = setup();

    expect(page.pendingCandidates()).toHaveLength(1);
    expect(page.stepStates().candidates).toBe('current');
  });

  it('the stats step stays open while a stat still waits for its session block', () => {
    reconciledToday = true;
    candidates = [makeCandidate({ promoted: true })];
    statsToComplete = [makeStat()];
    const page = setup();

    expect(page.stepStates().stats).not.toBe('done');
  });

  // #337 : BNRG (17/09) and SLNH (18/09) sat half-filled with nothing on this page pointing at them.
  it('keeps the stats step open on a stat left from an earlier day, and dates it', () => {
    reconciledToday = true;
    candidates = [makeCandidate({ promoted: true })];
    statsToComplete = [
      makeStat({ id: 's-sgbx', ticker: 'SGBX' }),
      makeStat({ id: 's-bnrg', ticker: 'BNRG', tradeDate: new Date(2026, 8, 17) }),
    ];
    const page = setup();

    expect(page.statsToCompleteToday().map((s) => s.ticker)).toEqual(['SGBX']);
    expect(page.overdueStats().map((s) => s.ticker)).toEqual(['BNRG']);
    expect(page.overdueLine()).toEqual({ tickers: 'BNRG (09/17)', more: 0 }); // en locale
    expect(page.stepStates().stats).not.toBe('done');
  });

  it('asks for the stats to complete of every day, not only today', () => {
    const findAll = vi.fn(() => of(page([])));
    TestBed.overrideProvider(StatsRepository, {
      useValue: { findAll, summary: () => of(makeStatSummary()) } as unknown as StatsRepository,
    });
    setup();

    expect(findAll).toHaveBeenCalledWith(
      { status: 'TO_COMPLETE' },
      expect.objectContaining({ sortField: 'tradeDate', sortDirection: 'desc' }),
    );
  });

  // Back from two weeks off, the page said « 50 to complete » when there were 63.
  it('counts every stat to complete, not the length of the page it received', () => {
    const findAll = vi.fn(() => of({ ...page([makeStat()]), totalElements: 63 }));
    TestBed.overrideProvider(StatsRepository, {
      useValue: { findAll, summary: () => of(makeStatSummary()) } as unknown as StatsRepository,
    });
    const today = setup();

    expect(today.statsToCompleteTotal()).toBe(63);
    expect(today.overdueTotal()).toBe(62);
  });

  // A failed call, or stats slower than the candidates, read as « nothing left » and ticked step 4.
  it('keeps the stats step open while the stats to complete are unknown', () => {
    reconciledToday = true;
    candidates = [makeCandidate({ promoted: true })];
    TestBed.overrideProvider(StatsRepository, {
      useValue: {
        findAll: () => throwError(() => new Error('500')),
        summary: () => of(makeStatSummary()),
      } as unknown as StatsRepository,
    });
    const page = setup();

    expect(page.statsToCompleteTotal()).toBeNull();
    expect(page.stepStates().stats).not.toBe('done');
  });

  it('names five overdue stats and counts the rest', () => {
    statsToComplete = ['GLND', 'KTTA', 'SLNH', 'BNRG', 'MLGO', 'ATXG', 'VERB'].map((ticker, i) =>
      makeStat({ id: `s-${ticker}`, ticker, tradeDate: new Date(2026, 8, 17 - i) }),
    );
    const page = setup();

    expect(page.overdueLine().tickers.split(', ')).toHaveLength(5);
    expect(page.overdueLine().more).toBe(2);
  });

  // The guard was dropped once step 2 took the promotion over ; step 4 then ticked, and unticked
  // the moment step 2 promoted the candidates left.
  it('keeps the stats step open while candidates are still to promote', () => {
    reconciledToday = true;
    candidates = [makeCandidate({ promoted: true }), makeCandidate({ id: 'c2', promoted: false })];
    const page = setup();

    expect(page.stepStates().stats).not.toBe('done');
  });

  it('a day with no candidate at all never counts its stats as done', () => {
    reconciledToday = true;
    const page = setup();

    // Nothing to complete *because* nothing was captured — that is not a day's work done.
    expect(page.stepStates().stats).not.toBe('done');
  });

  it('the day is fully walked once a trade is in and nothing is left pending', () => {
    reconciledToday = true;
    candidates = [makeCandidate({ promoted: true })];
    todayTrades = [makeTrade()];
    vi.setSystemTime(new Date('2026-09-18T21:00:00Z')); // 17:00 NY — the session is over
    const page = setup();

    expect(page.doneCount()).toBe(5);
    expect(Object.values(page.stepStates())).not.toContain('current');
  });

  // ---------------------------------------------------------------------------
  // Promote the remaining candidates
  // ---------------------------------------------------------------------------

  it('« promote the remaining » confirms before creating the stats', () => {
    candidates = [makeCandidate({ promoted: false })];
    const page = setup();

    page.promoteRemaining();

    expect(promoteDay).toHaveBeenCalledTimes(1);
  });

  it('cancelling that confirmation creates nothing', () => {
    confirmed = false;
    candidates = [makeCandidate({ promoted: false })];
    const page = setup();

    page.promoteRemaining();

    expect(promoteDay).not.toHaveBeenCalled();
  });

  it('nothing pending, nothing asked — the action is a no-op', () => {
    candidates = [makeCandidate({ promoted: true })];
    const page = setup();

    page.promoteRemaining();

    expect(promoteDay).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Resilience — it is the home page
  // ---------------------------------------------------------------------------

  it('a failing account summary leaves the rest of the day readable', () => {
    TestBed.overrideProvider(AccountRepository, {
      useValue: {
        getSummary: () => throwError(() => new Error('500')),
        reconciliations: () => of([]),
        reconcile: () => of(makeReconciliation()),
      } as unknown as AccountRepository,
    });
    candidates = [makeCandidate({ promoted: true })];

    const page = setup();

    expect(page.accountSummary()).toBeNull();
    expect(page.candidates()).toHaveLength(1);
    expect(page.stepStates().candidates).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function page<T>(content: T[]) {
  return { content, pageIndex: 0, pageSize: 20, totalElements: content.length, totalPages: 1 };
}

function makeAccountSummary() {
  return {
    balance: 27359.95,
    totalDeposits: 27000,
    totalWithdrawals: 0,
    netInjected: 27000,
    tradesPnl: 359.95,
    adjustments: 0,
    movementCount: 4,
  };
}

function makeReconciliation() {
  return {
    id: 'reco-1',
    valueDate: new Date(),
    brokerBalance: 27359.95,
    appBalance: 27359.95,
    gap: 0,
    correctionId: null,
    reconciledAt: new Date(),
  };
}

function makeStatSummary() {
  return {
    completed: 1,
    toComplete: 0,
    averagePushOpenPercent: 9.6,
    averageLodPercent: -12.3,
    fadeCount: 1,
    averageEodPercent: -3.7,
    traded: 1,
    untraded: 0,
  };
}

function makeJournalSummary() {
  return {
    tradeCount: 1,
    retainedPnl: 291.85,
    winCount: 1,
    lossCount: 0,
    winRatePercent: 100,
    averageWin: 291.85,
    averageLoss: null,
    profitFactor: null,
  };
}

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1',
    tradingDate: new Date(),
    pattern: 'GUS',
    ticker: 'SGBX',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    floatMillions: 8.2,
    volumeMillions: 3.1,
    locatePerShare: 0.03,
    note: null,
    openPrice: null,
    targetPushPercent: null,
    promoted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeStat(overrides: Partial<StatEntry> = {}): StatEntry {
  return {
    id: 'stat-1',
    candidateId: 'c1',
    tradeDate: new Date(),
    pattern: 'GUS',
    ticker: 'SGBX',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    floatMillions: 8.2,
    volumeMillions: 3.1,
    locatePerShare: 0.03,
    note: null,
    openPrice: null,
    pushOpenPrice: null,
    hodPrice: null,
    lodPrice: null,
    eodPrice: null,
    ssr: false,
    under1Dollar: false,
    entryAfter11am: false,
    noPush: false,
    highInstitutions: false,
    completed: false,
    tradeId: null,
    tradeRetainedProfitDollars: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    id: 'trade-1',
    statEntryId: 'stat-1',
    tradeDate: new Date(),
    ticker: 'KTTA',
    pattern: 'GUS',
    direction: 'SHORT',
    executions: [],
    size: 350,
    openPrice: 4.5,
    exitPrice: 3.66,
    gainPercent: 18.67,
    profitDollars: 294,
    realProfitDollars: 291.85,
    retainedProfitDollars: 291.85,
    retainedGainPercent: 18.53,
    durationMinutes: 214,
    note: null,
    errorNote: null,
    hasScreenshot: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
