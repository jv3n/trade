import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
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
 * - **Completion panel** — it opens on the first stat still to complete, « Later » closes it without
 *   saving and stops it re-opening, the save stays blocked until the five session prices are in
 *   (HOD below LOD included), and saving sends the whole row back with the premarket block intact.
 * - **Delete** — goes through the confirmation modal ; cancelling never reaches the repository.
 * - **Filters** — changing the status resets to page 0 and refetches.
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
    averageLodPercent: -12.3,
    fadeCount: 7,
    averageEodPercent: -3.7,
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
  summary = vi.fn((_filter?: StatEntryFilter): Observable<StatSummary> => of(makeSummary()));
  update = vi.fn((id: string, input: StatEntryInput): Observable<StatEntry> =>
    of(makeStat({ ...input, id, completed: true })),
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
  snackBarOpen: ReturnType<typeof vi.fn>;
} {
  const snackBarOpen = vi.fn();
  TestBed.configureTestingModule({
    imports: [StatsPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      provideRouter([]),
      { provide: StatsRepository, useClass: MockStatsRepository },
      { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      { provide: ConfirmService, useValue: { ask: () => of(options.confirmed ?? true) } },
    ],
  });
  const repo = TestBed.inject(StatsRepository) as MockStatsRepository;
  repo.rows = options.rows ?? [];
  const fixture = TestBed.createComponent(StatsPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, repo, snackBarOpen };
}

/** Types a full session into the completion panel. */
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

  // ---- Completion panel ----

  it('opens the completion panel on the first stat still to complete', () => {
    const pending = makePending();
    const { page } = setup({ rows: [makeStat(), pending] });

    expect(page.completing()?.id).toBe(pending.id);
    expect(page.session().openPrice).toBeNull();
  });

  it('Later closes the panel without saving and stops it re-opening on that stat', () => {
    const { fixture, page, repo } = setup({ rows: [makePending()] });

    page.later();
    expect(page.completing()).toBeNull();

    // A refetch (here : a filter change) must not bring the dismissed stat back.
    page.setStatus('TO_COMPLETE');
    fixture.detectChanges();
    expect(page.completing()).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('blocks the save until the five session prices are in', () => {
    const { page } = setup({ rows: [makePending()] });
    expect(page.canSave()).toBe(false);

    fillSession(page);

    expect(page.canSave()).toBe(true);
  });

  it('blocks the save when the HOD is below the LOD', () => {
    const { page } = setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('hodPrice', 3.2);

    expect(page.hodBelowLod()).toBe(true);
    expect(page.canSave()).toBe(false);
  });

  it('previews each session price against the open while typing', () => {
    const { page } = setup({ rows: [makePending()] });
    fillSession(page);

    const percents = page.sessionPercents();
    expect(percents.pushOpen).toBeCloseTo(10, 5);
    expect(percents.lod).toBeCloseTo(-18.81, 2);
  });

  it('saves the whole row back — session and flags updated, premarket untouched', () => {
    const pending = makePending();
    const { page, repo, snackBarOpen } = setup({ rows: [pending] });
    fillSession(page);
    page.toggleFlag('ssr', true);

    page.save();

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({
        ticker: 'SGBX',
        previousClose: pending.previousClose,
        pmOpen: pending.pmOpen,
        openPrice: 4.2,
        pushOpenPrice: 4.62,
        eodPrice: 3.52,
        ssr: true,
      }),
    );
    expect(snackBarOpen.mock.calls.at(-1)?.[2].panelClass).toBe('stb-snack-bar--success');
    expect(page.completing()).toBeNull();
  });

  it('keeps the panel open and toasts an error when the save fails', () => {
    const { page, repo, snackBarOpen } = setup({ rows: [makePending()] });
    repo.update.mockReturnValue(throwError(() => new Error('500 from server')));
    fillSession(page);

    page.save();

    expect(snackBarOpen.mock.calls.at(-1)?.[2].panelClass).toBe('stb-snack-bar--error');
    expect(page.completing()).not.toBeNull();
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

  it('changing the status filter refetches from page 0 with that status', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    page.pageIndex.set(2);

    page.setStatus('TO_COMPLETE');
    fixture.detectChanges();

    expect(page.pageIndex()).toBe(0);
    expect(repo.lastFilter?.status).toBe('TO_COMPLETE');
  });
});
