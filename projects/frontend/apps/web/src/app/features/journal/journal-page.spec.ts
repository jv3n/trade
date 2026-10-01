import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { provideNativeDateAdapter, StbToast } from '@portfolioai/ui';
import { JournalRepository, PagedResult } from '../../core/api/journal/journal.repository';
import {
  JournalDay,
  JournalSummary,
  TradeEntry,
  TradeEntryFilter,
} from '../../core/api/journal/trade-entry.model';
import { StatSummary } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { JournalPage } from './journal-page';

/**
 * Pins the listing behaviour of [JournalPage] — the regressions a typecheck alone can't catch :
 *
 *  - **The delete edge case** — deleting the **last** row of a non-zero page must decrement
 *    `pageIndex` instead of refetching the now-empty page. Without this, the user lands on
 *    an empty table for that page index until they manually click "previous".
 *  - **Multi-row delete refetches the current page** — the standard path. We trust the server
 *    for both the page content AND the total count, no local splicing.
 *  - **Snackbar variant matches the outcome** — `success` panel on a clean response, `error`
 *    panel when the repository throws.
 *  - **Cancelling the confirmation short-circuits the call** — no delete request fires when the
 *    user backs out of the confirmation modal (`ConfirmService`, stubbed here).
 *  - **One row per ticker and day** (#500) — a single-trade row opens its sheet in one click, a
 *    row of several opens onto them ; deleting one of several says the others stay.
 *  - **Filters and KPIs** (#195) — the page opens on the running month, the toolbar filters apply
 *    on click and rewind to page 0, the two summaries follow the same period as the listing, and a
 *    failing summary never takes the table down with it.
 *
 * Creation and edition are not journal-page concerns : a trade is born on the stats sheet (#193)
 * and is edited on its own page (#194). What is left here is the listing, the filters and delete.
 */
describe('JournalPage', () => {
  let nextPage: PagedResult<JournalDay>;
  let findDays: ReturnType<typeof vi.fn>;
  let ask: Mock<(key: string, options?: unknown) => Observable<boolean>>;
  let deleteSubject: Subject<void>;
  /** What the (stubbed) confirmation modal answers — confirmed unless a test says otherwise. */
  let confirmed: boolean;
  let toastShown: Mock<(variant: 'success' | 'error', message: string) => void>;
  let summary: ReturnType<typeof vi.fn>;
  let statSummary: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    nextPage = makePage([], 0);
    findDays = vi.fn(() => of(nextPage));
    ask = vi.fn((_key: string, _options?: unknown) => of(confirmed));
    deleteSubject = new Subject<void>();
    confirmed = true;
    toastShown = vi.fn();
    summary = vi.fn((_filter?: TradeEntryFilter) => of(makeSummary()));
    statSummary = vi.fn(() => of(makeStatSummary()));

    await TestBed.configureTestingModule({
      imports: [JournalPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        // The « custom » period reveals two `<mat-datepicker>` widgets. `MatDatepickerInput` reaches
        // for a `DateAdapter` at construction time ; without one the template fails to compile
        // and every test in this file ends up reporting the same "No DateAdapter" trace
        // instead of the actual delete logic regression we care about.
        provideNativeDateAdapter(),
        {
          provide: JournalRepository,
          useValue: {
            findDays,
            summary,
            findById: () => of({} as unknown),
            create: () => of({} as unknown),
            update: () => of({} as unknown),
            delete: () => deleteSubject.asObservable(),
            exportCsv: () => of(new Blob()),
          } as unknown as JournalRepository,
        },
        {
          provide: StatsRepository,
          useValue: { summary: statSummary } as unknown as StatsRepository,
        },
        {
          provide: StbToast,
          useValue: {
            success: (message: string) => toastShown('success', message),
            error: (message: string) => toastShown('error', message),
          },
        },
        {
          provide: ConfirmService,
          useValue: { ask: (key: string, options?: unknown) => ask(key, options) },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  // ---------------------------------------------------------------------------
  // Filters + KPIs (#195)
  // ---------------------------------------------------------------------------

  it('opens on the running month and asks the two summaries for that same period', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.appliedFilter().period).toBe('thisMonth');
    expect(page.appliedFilter().dateFrom).not.toBeNull();

    const listed = findDays.mock.calls[0][0] as TradeEntryFilter;
    const summarised = summary.mock.calls[0][0] as TradeEntryFilter;
    expect(summarised.dateFrom).toEqual(listed.dateFrom);
    expect(summarised.dateTo).toEqual(listed.dateTo);
    expect(page.summary()?.retainedPnl).toBe(751.85);
    // « 8 / 10 » — the stats count covers the same period.
    expect(page.statCount()).toBe(10);
  });

  it('picking a pattern refetches on that single pattern and rewinds to page 0', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.pageIndex.set(3);
    fixture.detectChanges();

    page.setPattern('DT');
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(0);
    const last = findDays.mock.calls.at(-1)?.[0] as TradeEntryFilter;
    expect(last.patterns).toEqual(['DT']);
  });

  it('the winners segment narrows the listing AND the KPIs to PROFITABLE', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.setStatus('PROFITABLE');
    fixture.detectChanges();

    expect((findDays.mock.calls.at(-1)?.[0] as TradeEntryFilter).status).toBe('PROFITABLE');
    expect((summary.mock.calls.at(-1)?.[0] as TradeEntryFilter).status).toBe('PROFITABLE');
  });

  it('the stats KPI ignores the pattern and outcome — « traded / all » compares one period', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.setStatus('LOSING');
    fixture.detectChanges();

    const last = statSummary.mock.calls.at(-1)?.[0] as { status?: unknown; patterns?: unknown };
    expect(last.status).toBeUndefined();
    expect(last.patterns).toBeUndefined();
  });

  // #499 : a discipline number, beside the P&L — together they make it.
  it('shows the out-of-pattern P&L with the in-rules one beside it', async () => {
    summary.mockReturnValue(
      of(makeSummary({ outOfPatternCount: 1, outOfPatternPnl: -233.55, inRulesPnl: 985.4 })),
    );
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const card = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="out-of-pattern"]',
    );
    expect(card?.querySelector('.kpi__value')?.textContent).toContain('-233.55');
    expect(card?.querySelector('.kpi__value')?.classList).toContain('profit-negative');
  });

  it('a failing summary empties its cards without taking the listing down', () => {
    summary.mockReturnValue(throwError(() => new Error('500')));
    nextPage = makePage([makeDay([makeTrade()])], 1);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.summary()).toBeNull();
    expect(page.days()).toHaveLength(1);
    expect(page.error()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // One row per ticker and day (#500)
  // ---------------------------------------------------------------------------

  it('a single-trade row opens its trade sheet in one click', () => {
    const day = makeDay([makeTrade()]);
    nextPage = makePage([day], 1);
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.componentInstance.openRow(day);

    expect(navigate).toHaveBeenCalledWith(['/journal', 'id-1']);
  });

  it('a row of several trades opens onto them, and a second click closes it', () => {
    // SDEV, 29/09 : three trades on one name, one row.
    const day = makeDay([
      makeTrade({ id: 't1', ticker: 'SDEV' }),
      makeTrade({ id: 't2', ticker: 'SDEV' }),
      makeTrade({ id: 't3', ticker: 'SDEV' }),
    ]);
    nextPage = makePage([day], 1);
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    page.openRow(day);
    fixture.detectChanges();
    expect(page.isExpanded(day)).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.day-trade')).toHaveLength(3);
    expect(navigate).not.toHaveBeenCalled();

    page.openRow(day);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.day-trade')).toHaveLength(0);
  });

  it('deleting one of several trades says the others are kept', () => {
    const trades = [makeTrade({ id: 't1' }), makeTrade({ id: 't2' })];
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();

    fixture.componentInstance.delete(trades[1], makeDay(trades));

    expect(ask).toHaveBeenCalledWith('journal.confirmDeleteOne', {
      params: { ticker: 'BAC', others: 1 },
      variant: 'danger',
    });
  });

  it('a row whose sums leave trades out says how many, and a complete row says nothing', () => {
    // ZEO-like day (#515) : one trade still open, one with no fill times — the sums stay.
    const partial = makeDay([
      makeTrade({ id: 't1', retainedProfitDollars: -120, durationMinutes: 12 }),
      makeTrade({ id: 't2', retainedProfitDollars: null, durationMinutes: 4 }),
      makeTrade({ id: 't3', retainedProfitDollars: -80, durationMinutes: null }),
    ]);
    const complete = makeDay([
      makeTrade({ id: 't4', ticker: 'KTTA', retainedProfitDollars: 291.85, durationMinutes: 214 }),
    ]);
    nextPage = makePage([partial, complete], 2);
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.missingPnl(partial)).toBe(1);
    expect(page.missingDuration(partial)).toBe(1);
    expect(page.missingPnl(complete)).toBe(0);
    const rows = fixture.nativeElement.querySelectorAll('tr.journal-row');
    expect(rows[0].querySelectorAll('.partial')).toHaveLength(2);
    expect(rows[1].querySelectorAll('.partial')).toHaveLength(0);
  });

  it('« 20 min » under an hour, « 3 h 04 » above', () => {
    const fixture = TestBed.createComponent(JournalPage);
    const page = fixture.componentInstance;

    expect(page.durationLabel(20)).toBe('journal.duration.minutes');
    expect(page.durationLabel(184)).toBe('journal.duration.hours');
    expect(page.durationLabel(null)).toBe('—');
  });

  // ---------------------------------------------------------------------------
  // delete() — edge case : last row of a non-zero page
  // ---------------------------------------------------------------------------

  it('delete on the last row of a non-zero page decrements pageIndex instead of refetching', () => {
    // 21 trades total, 10 per page → page 2 carries the single 21st row. Deleting it would
    // leave page 2 with zero rows after a naive refetch.
    nextPage = makePage([makeDay([makeTrade()])], 21);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.pageIndex.set(2);
    fixture.detectChanges();

    const callsBefore = findDays.mock.calls.length;
    page.delete(makeTrade(), makeDay([makeTrade()]));
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(1);
    // pageIndex change itself triggers the effect → exactly one additional fetch.
    expect(findDays.mock.calls.length).toBe(callsBefore + 1);
    expect(toastShown).toHaveBeenCalledWith('success', expect.any(String));
  });

  it('delete on the last row of page 0 does NOT decrement pageIndex (refetches in place)', () => {
    // Only one trade, on page 0. The naive refetch is correct here — we don't want to bump
    // pageIndex into negative territory.
    nextPage = makePage([makeDay([makeTrade()])], 1);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const callsBefore = findDays.mock.calls.length;
    page.delete(makeTrade(), makeDay([makeTrade()]));
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(0);
    expect(findDays.mock.calls.length).toBe(callsBefore + 1);
  });

  // ---------------------------------------------------------------------------
  // delete() — multi-row standard path
  // ---------------------------------------------------------------------------

  it('delete on a multi-row page refetches the current page (no pageIndex change)', () => {
    nextPage = makePage(
      [makeDay([makeTrade()]), makeDay([makeTrade({ id: 'id-2', ticker: 'AAPL' })])],
      12,
    );

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.pageIndex.set(1);
    fixture.detectChanges();

    const callsBefore = findDays.mock.calls.length;
    page.delete(makeTrade(), makeDay([makeTrade()]));
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(1);
    expect(findDays.mock.calls.length).toBe(callsBefore + 1);
  });

  // ---------------------------------------------------------------------------
  // delete() — error path
  // ---------------------------------------------------------------------------

  it('delete error fires an error snackbar', () => {
    nextPage = makePage([makeDay([makeTrade()])], 1);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.delete(makeTrade(), makeDay([makeTrade()]));
    deleteSubject.error(new Error('500 from server'));
    fixture.detectChanges();

    expect(toastShown).toHaveBeenCalledWith('error', expect.any(String));
  });

  // ---------------------------------------------------------------------------
  // delete() — confirmation modal cancelled
  // ---------------------------------------------------------------------------

  it('user cancelling the confirmation modal never reaches the repository', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const deleteSpy = vi.spyOn(deleteSubject, 'subscribe');
    confirmed = false;

    page.delete(makeTrade(), makeDay([makeTrade()]));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(toastShown).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    id: 'id-1',
    statEntryId: 'stat-1',
    tradeDate: new Date(2026, 5, 4),
    ticker: 'BAC',
    pattern: 'GUS',
    direction: 'SHORT',
    executions: [{ seq: 0, kind: 'ENTRY', shares: 100, price: 3.21, executedAt: null }],
    size: 100,
    openPrice: 3.21,
    exitPrice: null,
    gainPercent: null,
    profitDollars: null,
    realProfitDollars: null,
    retainedProfitDollars: null,
    retainedGainPercent: null,
    durationMinutes: null,
    note: null,
    errorNote: null,
    hasScreenshot: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** The row of [trades] — one ticker and day, the figures added up the way the backend does. */
function makeDay(trades: TradeEntry[]): JournalDay {
  const single = trades.length === 1 ? trades[0] : null;
  return {
    tradeDate: trades[0].tradeDate,
    ticker: trades[0].ticker,
    patterns: [...new Set(trades.map((t) => t.pattern))],
    directions: [...new Set(trades.flatMap((t) => (t.direction ? [t.direction] : [])))],
    tradeCount: trades.length,
    maxSize: Math.max(...trades.map((t) => t.size ?? 0)),
    openPrice: single?.openPrice ?? null,
    exitPrice: single?.exitPrice ?? null,
    retainedGainPercent: single?.retainedGainPercent ?? null,
    durationMinutes: null,
    retainedProfitDollars: null,
    trades,
  };
}

function makeSummary(overrides: Partial<JournalSummary> = {}): JournalSummary {
  return {
    tradeCount: 8,
    retainedPnl: 751.85,
    winCount: 6,
    lossCount: 2,
    winRatePercent: 75,
    averageWin: 175,
    averageLoss: -149,
    profitFactor: 3.52,
    outOfPatternCount: 0,
    outOfPatternPnl: 0,
    inRulesPnl: 0,
    ...overrides,
  };
}

function makeStatSummary(overrides: Partial<StatSummary> = {}): StatSummary {
  return {
    completed: 10,
    toComplete: 0,
    averagePushOpenPercent: 9.6,
    medianPushOpenPercent: 6.8,
    thirdQuartilePushOpenPercent: 14.2,
    maxPushOpenPercent: 21.5,
    noPushCount: 0,
    medianLodPercent: -12.3,
    fadeCount: 7,
    medianEodPercent: -3.7,
    medianHoldPercent: -17.3,
    medianCumulativePmHighPercent: 74.9,
    medianCumulativeOpenPercent: 42.9,
    completedDoubleTops: 0,
    averageExtensionPercent: null,
    averageExtensionWithGapPercent: null,
    averageRejectionPercent: null,
    rejectionAtCriterionCount: 0,
    averageRetestPercent: null,
    averageRetestToTopPercent: null,
    retestTookTopCount: 0,
    medianDoubleTopMinutes: null,
    medianRejectionMinutes: null,
    traded: 8,
    untraded: 2,
    ...overrides,
  };
}

function makePage(content: JournalDay[], total: number): PagedResult<JournalDay> {
  return {
    content,
    pageIndex: 0,
    pageSize: 10,
    totalElements: total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
  };
}
