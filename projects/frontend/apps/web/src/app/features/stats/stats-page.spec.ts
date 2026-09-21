import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast, provideNativeDateAdapter } from '@portfolioai/ui';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import {
  PageRequest,
  PagedResult,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatSummary,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { StatsPage } from './stats-page';

/**
 * Component spec for the stats page. The formulas are pinned in `stats.math.spec`, so here we pin
 * the wiring :
 *
 * - **Listing + KPIs** load together on init, and the KPI call carries the same filter as the list.
 * - **Derived columns** — each row exposes gap, PM push and the four session percentages.
 * - **Session panel** — it opens on the first stat still to complete ; each field left saves the
 *   whole row (premarket intact) when something changed, nothing while the HOD sits under the LOD ;
 *   Close saves the field being typed and stops the panel re-opening. A ticked stat can't lose a
 *   price, and a failed save puts the row back.
 * - **The ✓** — disabled until the five prices are in, it ticks / unticks through `setCompleted`
 *   and reloads the list ; the writes are queued, so a field left right before ✓ lands first.
 * - **Delete** — goes through the confirmation modal ; cancelling never reaches the repository.
 * - **Filters** — changing the status resets to page 0 and refetches ; a custom period range
 *   reaches both the listing and the KPIs.
 * - **No push (#302)** — ticking it empties the push and takes it out of the prices a stat needs ;
 *   unticking gives the typed push back ; the « No push » tab is its own filter axis.
 *
 * The repository, the confirmation modal and the snackbar are stubbed so nothing touches HTTP.
 */

/** KTTA on 09/17 — completed session (open 4.20, push 4.62, HOD 4.62, LOD 3.41, EOD 3.52). */
function makeStat(overrides: Partial<StatEntry> = {}): StatEntry {
  return {
    id: 'stat-ktta',
    candidateId: 'cand-ktta',
    tradeDate: new Date(2026, 8, 17),
    pattern: 'GUS',
    ticker: 'KTTA',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    floatMillions: 8.2,
    volumeMillions: 3.1,
    locatePerShare: 0.03,
    note: 'Résistance 4,65',
    openPrice: 4.2,
    pushOpenPrice: 4.62,
    hodPrice: 4.62,
    lodPrice: 3.41,
    eodPrice: 3.52,
    ssr: false,
    under1Dollar: false,
    entryAfter11am: false,
    noPush: false,
    completed: true,
    tradeId: null,
    tradeRetainedProfitDollars: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A stat promoted this morning : premarket only, session still to enter. */
function makePending(overrides: Partial<StatEntry> = {}): StatEntry {
  return makeStat({
    id: 'stat-sgbx',
    ticker: 'SGBX',
    candidateId: 'cand-sgbx',
    openPrice: null,
    pushOpenPrice: null,
    hodPrice: null,
    lodPrice: null,
    eodPrice: null,
    completed: false,
    ...overrides,
  });
}

function makeSummary(overrides: Partial<StatSummary> = {}): StatSummary {
  return {
    completed: 10,
    toComplete: 1,
    averagePushOpenPercent: 9.6,
    medianPushOpenPercent: 6.8,
    thirdQuartilePushOpenPercent: 14.2,
    maxPushOpenPercent: 21.5,
    noPushCount: 0,
    averageLodPercent: -12.3,
    fadeCount: 7,
    averageEodPercent: -3.7,
    traded: 8,
    untraded: 2,
    ...overrides,
  };
}

/**
 * Mock port — **extends** the abstract `StatsRepository` so the stub stays type-safe against the
 * real contract (`useClass MockXxx extends XxxRepository`, never a bare `useValue`).
 */
class MockStatsRepository extends StatsRepository {
  rows: StatEntry[] = [];
  lastFilter: StatEntryFilter | undefined;

  findAll = vi.fn(
    (filter?: StatEntryFilter, _page?: PageRequest): Observable<PagedResult<StatEntry>> => {
      this.lastFilter = filter;
      return of({
        content: this.rows,
        pageIndex: 0,
        pageSize: 25,
        totalElements: this.rows.length,
        totalPages: 1,
      });
    },
  );
  findById = vi.fn((id: string): Observable<StatEntry> => of(makeStat({ id })));
  summary = vi.fn((_filter?: StatEntryFilter): Observable<StatSummary> => of(makeSummary()));
  update = vi.fn((id: string, input: StatEntryInput): Observable<StatEntry> =>
    of(
      makeStat({ ...input, id, completed: this.rows.find((r) => r.id === id)?.completed ?? false }),
    ),
  );
  setCompleted = vi.fn((id: string, completed: boolean): Observable<StatEntry> =>
    of({ ...(this.rows.find((r) => r.id === id) ?? makeStat({ id })), completed }),
  );
  delete = vi.fn((_id: string): Observable<void> => of(undefined));
  promoteToTrade = vi.fn((_id: string): Observable<TradeEntry> =>
    of({ id: 'trade-1' } as TradeEntry),
  );
  exportCsv = vi.fn((): Observable<Blob> => of(new Blob()));
}

function setup(options: { rows?: StatEntry[]; confirmed?: boolean } = {}): {
  fixture: ComponentFixture<StatsPage>;
  page: StatsPage;
  repo: MockStatsRepository;
  toastShown: ReturnType<typeof vi.fn>;
} {
  const toastShown = vi.fn();
  TestBed.configureTestingModule({
    imports: [StatsPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      provideRouter([]),
      { provide: StatsRepository, useClass: MockStatsRepository },
      {
        provide: StbToast,
        useValue: {
          success: (message: string) => toastShown('success', message),
          error: (message: string) => toastShown('error', message),
        },
      },
      { provide: ConfirmService, useValue: { ask: () => of(options.confirmed ?? true) } },
    ],
  });
  const repo = TestBed.inject(StatsRepository) as MockStatsRepository;
  repo.rows = options.rows ?? [];
  const fixture = TestBed.createComponent(StatsPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, repo, toastShown };
}

/** Types a full session into the session panel. */
function fillSession(page: StatsPage): void {
  page.setSessionPrice('openPrice', 4.2);
  page.setSessionPrice('pushOpenPrice', 4.62);
  page.setSessionPrice('hodPrice', 4.62);
  page.setSessionPrice('lodPrice', 3.41);
  page.setSessionPrice('eodPrice', 3.52);
}

describe('StatsPage', () => {
  // ---- Listing + KPIs ----

  it('loads the listing and the KPIs of the same filter on init', () => {
    const { repo, page } = setup({ rows: [makeStat()] });

    expect(repo.findAll).toHaveBeenCalledTimes(1);
    expect(repo.summary).toHaveBeenCalledTimes(1);
    expect(repo.summary.mock.calls[0][0]).toEqual(repo.lastFilter);
    expect(page.summary()?.completed).toBe(10);
  });

  it('derives the premarket and session percentages of each row', () => {
    const { page } = setup({ rows: [makeStat()] });

    const row = page.rows()[0];
    expect(row.gap).toBeCloseTo(52.83, 2);
    expect(row.pmPush).toBeCloseTo(14.81, 2);
    expect(row.pushOpenPercent).toBeCloseTo(10, 5);
    expect(row.lodPercent).toBeCloseTo(-18.81, 2);
    expect(row.eodPercent).toBeCloseTo(-16.19, 2);
  });

  it('shows an error banner when the listing fails', () => {
    const { fixture, page, repo } = setup();
    repo.findAll.mockReturnValue(throwError(() => new Error('500 from server')));

    page.setStatus('COMPLETED');
    fixture.detectChanges(); // the fetch effect re-runs on change detection

    expect(page.error()).not.toBeNull();
    expect(page.rows()).toEqual([]);
  });

  // ---- Session panel ----

  it('opens the session panel on the first stat still to complete', () => {
    const pending = makePending();
    const { page } = setup({ rows: [makeStat(), pending] });

    expect(page.completing()?.id).toBe(pending.id);
    expect(page.session().openPrice).toBeNull();
  });

  it('saves the whole row when a field is left — session updated, premarket untouched', () => {
    const pending = makePending();
    const { page, repo } = setup({ rows: [pending] });

    // 9:30 : only the open is known.
    page.setSessionPrice('openPrice', 1.9);
    page.saveSession();

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({
        ticker: 'SGBX',
        previousClose: pending.previousClose,
        pmOpen: pending.pmOpen,
        openPrice: 1.9,
        pushOpenPrice: null,
      }),
    );
    expect(page.sessionSaved()).toBe(true);
    expect(page.rows()[0].openPrice).toBe(1.9);
    expect(page.completing()?.id).toBe('stat-sgbx');
  });

  it('saves a flag as soon as it is ticked', () => {
    const { page, repo } = setup({ rows: [makePending()] });

    page.toggleFlag('entryAfter11am', true);

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ entryAfter11am: true }),
    );
  });

  it('sends nothing when a field is left unchanged', () => {
    const { page, repo } = setup({ rows: [makePending()] });

    page.saveSession();

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('sends nothing while the HOD is below the LOD', () => {
    const { page, repo } = setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('hodPrice', 3.2);
    page.saveSession();

    expect(page.hodBelowLod()).toBe(true);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('previews each session price against the open while typing', () => {
    const { page } = setup({ rows: [makePending()] });
    fillSession(page);

    const percents = page.sessionPercents();
    expect(percents.pushOpen).toBeCloseTo(10, 5);
    expect(percents.lod).toBeCloseTo(-18.81, 2);
  });

  it('counts the prices in and names the missing ones', () => {
    const { page } = setup({ rows: [makePending()] });

    page.setSessionPrice('openPrice', 1.9);
    page.setSessionPrice('pushOpenPrice', 2.2);

    expect(page.sessionFilled()).toBe(2);
    expect(page.sessionMissing()).toEqual([
      'stats.fields.hod',
      'stats.fields.lod',
      'stats.fields.eod',
    ]);
  });

  it('Close saves the field being typed, then stops the panel re-opening on that stat', () => {
    const { fixture, page, repo } = setup({ rows: [makePending()] });
    page.setSessionPrice('openPrice', 1.9);

    page.close();

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ openPrice: 1.9 }),
    );
    expect(page.completing()).toBeNull();
    // A refetch (here : a filter change) must not bring the closed stat back.
    page.setStatus('TO_COMPLETE');
    fixture.detectChanges();
    expect(page.completing()).toBeNull();
  });

  it('refuses to clear a price of a ticked stat and puts the value back', () => {
    const ticked = makeStat({ completed: true });
    const { page, repo, toastShown } = setup({ rows: [ticked] });
    page.open(ticked);

    page.setSessionPrice('eodPrice', null);
    page.saveSession();

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.session().eodPrice).toBe(3.52);
    expect(toastShown.mock.calls.at(-1)?.[0]).toBe('error');
  });

  it('puts the row back and toasts an error when a save fails', () => {
    const { page, repo, toastShown } = setup({ rows: [makePending()] });
    repo.update.mockReturnValue(throwError(() => new Error('500 from server')));

    page.setSessionPrice('openPrice', 1.9);
    page.saveSession();

    expect(toastShown.mock.calls.at(-1)?.[0]).toBe('error');
    expect(page.rows()[0].openPrice).toBeNull();
    expect(page.session().openPrice).toBeNull();
    expect(page.completing()).not.toBeNull();
  });

  // ---- The ✓ (#263) ----

  it('lists what a row misses before it can be ticked', () => {
    const { page } = setup({ rows: [makePending({ openPrice: 1.9, pushOpenPrice: 2.2 })] });

    expect(page.rows()[0].missing).toEqual([
      'stats.fields.hod',
      'stats.fields.lod',
      'stats.fields.eod',
    ]);
  });

  it('ticks a stat with its five prices, then reloads the list', () => {
    const full = makeStat({ id: 'stat-bnrg', ticker: 'BNRG', completed: false });
    const { fixture, page, repo } = setup({ rows: [full] });
    const fetchesBefore = repo.findAll.mock.calls.length;

    page.toggleCompleted(full);
    fixture.detectChanges(); // the fetch effect re-runs on change detection

    expect(repo.setCompleted).toHaveBeenCalledWith('stat-bnrg', true);
    // How many times the effect fires under the test's change detection is not the point — that
    // the list is fetched again after the tick is.
    expect(repo.findAll.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it('unticks a completed stat', () => {
    const ticked = makeStat({ completed: true });
    const { page, repo } = setup({ rows: [ticked] });

    page.toggleCompleted(ticked);

    expect(repo.setCompleted).toHaveBeenCalledWith('stat-ktta', false);
  });

  it('never ticks a stat that misses a price', () => {
    const pending = makePending();
    const { page, repo } = setup({ rows: [pending] });

    page.toggleCompleted(pending);

    expect(repo.setCompleted).not.toHaveBeenCalled();
  });

  it('sends the last field before the tick, one write at a time', () => {
    const pending = makePending({
      openPrice: 4.2,
      pushOpenPrice: 4.62,
      hodPrice: 4.62,
      lodPrice: 3.41,
    });
    const { page, repo } = setup({ rows: [pending] });
    const order: string[] = [];
    repo.update.mockImplementation((id: string, input: StatEntryInput) => {
      order.push('update');
      return of(makeStat({ ...input, id, completed: false }));
    });
    repo.setCompleted.mockImplementation((id: string, completed: boolean) => {
      order.push('tick');
      return of(makeStat({ id, completed }));
    });

    page.setSessionPrice('eodPrice', 3.52);
    page.saveSession(); // the EOD field loses focus to the ✓…
    page.toggleCompleted(page.rows()[0]); // …which is clicked right after

    expect(order).toEqual(['update', 'tick']);
  });

  // ---- Delete ----

  it('deletes a stat once the confirmation modal is confirmed', () => {
    const { page, repo } = setup({ rows: [makeStat()] });

    page.delete(makeStat());

    expect(repo.delete).toHaveBeenCalledWith('stat-ktta');
  });

  it('never reaches the repository when the confirmation modal is cancelled', () => {
    const { page, repo } = setup({ rows: [makeStat()], confirmed: false });

    page.delete(makeStat());

    expect(repo.delete).not.toHaveBeenCalled();
  });

  // ---- Stat → trade (#193) ----

  it('« → Trade » creates the trade and lands on its page', () => {
    // The whole point of the action is to go and type the executions, so the navigation is part of
    // the contract, not a nicety.
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    page.promoteToTrade(makeStat());

    expect(repo.promoteToTrade).toHaveBeenCalledWith('stat-ktta');
    expect(navigate).toHaveBeenCalledWith(['/journal', 'trade-1']);
  });

  it('a cancelled confirmation creates nothing', () => {
    const { page, repo } = setup({ rows: [makeStat()], confirmed: false });

    page.promoteToTrade(makeStat());

    expect(repo.promoteToTrade).not.toHaveBeenCalled();
  });

  it('a stat that already has a trade carries the link instead of the action', () => {
    const traded = makeStat({ tradeId: 'trade-7', tradeRetainedProfitDollars: 291.35 });
    const { page } = setup({ rows: [traded] });

    const row = page.rows()[0];
    expect(row.tradeId).toBe('trade-7');
    expect(row.tradeRetainedProfitDollars).toBe(291.35);
  });

  // ---- Filters ----

  it('a custom period range filters the listing and the KPIs', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    const from = new Date(2026, 8, 14);
    const to = new Date(2026, 8, 18);

    page.setPeriod({ period: 'custom', dateFrom: from, dateTo: to });
    fixture.detectChanges(); // the fetch effect re-runs on change detection

    expect(repo.lastFilter?.dateFrom).toEqual(from);
    expect(repo.lastFilter?.dateTo).toEqual(to);
    expect(repo.summary.mock.calls.at(-1)?.[0]).toEqual(repo.lastFilter);
  });

  it('changing the status filter refetches from page 0 with that status', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    page.pageIndex.set(2);

    page.setStatus('TO_COMPLETE');
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(0);
    expect(repo.lastFilter?.status).toBe('TO_COMPLETE');
  });

  // ---- No push (#302) ----

  // GLND, 2026-09-21 : dropped straight from the open, only came back up around 11 am.
  it('« No push » empties the push, saves it and counts four prices', () => {
    const { page, repo } = setup({ rows: [makePending({ ticker: 'GLND' })] });
    page.setSessionPrice('pushOpenPrice', 3.3);

    page.toggleNoPush(true);

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ noPush: true, pushOpenPrice: null }),
    );
    expect(page.sessionPriceCount()).toBe(4);
    expect(page.sessionMissing()).not.toContain('stats.fields.pushOpen');
  });

  it('unticking « No push » gives back the push typed before', () => {
    const { page } = setup({ rows: [makePending()] });
    page.setSessionPrice('pushOpenPrice', 3.3);

    page.toggleNoPush(true);
    page.toggleNoPush(false);

    expect(page.session().pushOpenPrice).toBe(3.3);
    expect(page.sessionPriceCount()).toBe(5);
  });

  it('a no-push stat can be ticked without a push price', () => {
    const glnd = makeStat({ noPush: true, pushOpenPrice: null, completed: false });
    const { page } = setup({ rows: [glnd] });

    expect(page.rows()[0].missing).toEqual([]);
  });

  it('the « No push » tab filters on the no-push days, whatever their status', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });

    page.setStatus('NO_PUSH');
    fixture.detectChanges();

    expect(repo.lastFilter?.noPush).toBe(true);
    expect(repo.lastFilter?.status).toBeNull();
  });
});
