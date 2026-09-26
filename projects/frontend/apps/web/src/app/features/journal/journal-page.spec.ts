import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { provideNativeDateAdapter, StbToast } from '@portfolioai/ui';
import { JournalRepository, PagedResult } from '../../core/api/journal/journal.repository';
import {
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
 *  - **Filters and KPIs** (#195) — the page opens on the running month, the toolbar filters apply
 *    on click and rewind to page 0, the two summaries follow the same period as the listing, and a
 *    failing summary never takes the table down with it.
 *
 * Creation and edition are not journal-page concerns : a trade is born on the stats sheet (#193)
 * and is edited on its own page (#194). What is left here is the listing, the filters and delete.
 */
describe('JournalPage', () => {
  let nextPage: PagedResult<TradeEntry>;
  let findAll: ReturnType<typeof vi.fn>;
  let deleteSubject: Subject<void>;
  /** What the (stubbed) confirmation modal answers — confirmed unless a test says otherwise. */
  let confirmed: boolean;
  let toastShown: Mock<(variant: 'success' | 'error', message: string) => void>;
  let summary: ReturnType<typeof vi.fn>;
  let statSummary: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    nextPage = makePage([], 0);
    findAll = vi.fn(() => of(nextPage));
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
            findAll,
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
        { provide: ConfirmService, useValue: { ask: () => of(confirmed) } },
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

    const listed = findAll.mock.calls[0][0] as TradeEntryFilter;
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
    const last = findAll.mock.calls.at(-1)?.[0] as TradeEntryFilter;
    expect(last.patterns).toEqual(['DT']);
  });

  it('the winners segment narrows the listing AND the KPIs to PROFITABLE', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.setStatus('PROFITABLE');
    fixture.detectChanges();

    expect((findAll.mock.calls.at(-1)?.[0] as TradeEntryFilter).status).toBe('PROFITABLE');
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

  it('a failing summary empties its cards without taking the listing down', () => {
    summary.mockReturnValue(throwError(() => new Error('500')));
    nextPage = makePage([makeTrade()], 1);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.summary()).toBeNull();
    expect(page.entries()).toHaveLength(1);
    expect(page.error()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // delete() — edge case : last row of a non-zero page
  // ---------------------------------------------------------------------------

  it('delete on the last row of a non-zero page decrements pageIndex instead of refetching', () => {
    // 21 trades total, 10 per page → page 2 carries the single 21st row. Deleting it would
    // leave page 2 with zero rows after a naive refetch.
    nextPage = makePage([makeTrade()], 21);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.pageIndex.set(2);
    fixture.detectChanges();

    const callsBefore = findAll.mock.calls.length;
    page.delete(makeTrade());
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(1);
    // pageIndex change itself triggers the effect → exactly one additional fetch.
    expect(findAll.mock.calls.length).toBe(callsBefore + 1);
    expect(toastShown).toHaveBeenCalledWith('success', expect.any(String));
  });

  it('delete on the last row of page 0 does NOT decrement pageIndex (refetches in place)', () => {
    // Only one trade, on page 0. The naive refetch is correct here — we don't want to bump
    // pageIndex into negative territory.
    nextPage = makePage([makeTrade()], 1);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const callsBefore = findAll.mock.calls.length;
    page.delete(makeTrade());
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(0);
    expect(findAll.mock.calls.length).toBe(callsBefore + 1);
  });

  // ---------------------------------------------------------------------------
  // delete() — multi-row standard path
  // ---------------------------------------------------------------------------

  it('delete on a multi-row page refetches the current page (no pageIndex change)', () => {
    nextPage = makePage([makeTrade(), makeTrade({ id: 'id-2', ticker: 'AAPL' })], 12);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.pageIndex.set(1);
    fixture.detectChanges();

    const callsBefore = findAll.mock.calls.length;
    page.delete(makeTrade());
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(1);
    expect(findAll.mock.calls.length).toBe(callsBefore + 1);
  });

  // ---------------------------------------------------------------------------
  // delete() — error path
  // ---------------------------------------------------------------------------

  it('delete error fires an error snackbar', () => {
    nextPage = makePage([makeTrade()], 1);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.delete(makeTrade());
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

    page.delete(makeTrade());

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
    averageLodPercent: -12.3,
    fadeCount: 7,
    averageEodPercent: -3.7,
    completedDoubleTops: 0,
    averageExtensionPercent: null,
    averageExtensionWithGapPercent: null,
    averageRejectionPercent: null,
    rejectionAtCriterionCount: 0,
    averageRetestPercent: null,
    averageRetestToTopPercent: null,
    retestTookTopCount: 0,
    traded: 8,
    untraded: 2,
    ...overrides,
  };
}

function makePage(content: TradeEntry[], total: number): PagedResult<TradeEntry> {
  return {
    content,
    pageIndex: 0,
    pageSize: 10,
    totalElements: total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
  };
}
