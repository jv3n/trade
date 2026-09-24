import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast, provideNativeDateAdapter } from '@portfolioai/ui';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
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
 *   reaches both the listing and the KPIs. A refetch keeps the rows on screen, dimmed, and a
 *   superseded answer is dropped (#370).
 * - **Premarket card (#326)** — editable like the session, saved field by field with its own save
 *   state ; a PM high under the PM open is refused before anything is sent.
 * - **An emptied premarket price (#340)** — the field says it is required and nothing is sent, the
 *   session card included (and the other way round on a HOD under the LOD) ; leaving the panel
 *   asks first whenever an edit never left, whichever validation held it back.
 * - **The save cue (#342)** — it states the day when the last save is not from today.
 * - **New stat (#326)** — the two cards empty with the identity on top ; « Create » waits for the
 *   date, the ticker and the three premarket prices, goes through the confirmation modal, then the
 *   panel carries on with the created stat.
 * - **No push (#302)** — ticking it empties the push and takes it out of the prices a stat needs ;
 *   unticking gives the typed push back ; the « No push » tab is its own filter axis, and its push
 *   KPI rates the no-push days over the whole period (#334).
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
    highInstitutions: true,
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
  create = vi.fn((input: StatEntryInput): Observable<StatEntry> =>
    of(makeStat({ ...input, id: 'stat-new', candidateId: null, completed: false })),
  );
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

function setup(
  options: { rows?: StatEntry[]; confirmed?: boolean; query?: Record<string, string> } = {},
): {
  fixture: ComponentFixture<StatsPage>;
  page: StatsPage;
  repo: MockStatsRepository;
  toastShown: ReturnType<typeof vi.fn>;
  query: BehaviorSubject<ParamMap>;
} {
  const toastShown = vi.fn();
  const query = new BehaviorSubject(convertToParamMap(options.query ?? {}));
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
      // Only when a test names a query : the rows' `routerLink` needs the real route otherwise.
      ...(options.query ? [{ provide: ActivatedRoute, useValue: { queryParamMap: query } }] : []),
    ],
  });
  const repo = TestBed.inject(StatsRepository) as MockStatsRepository;
  repo.rows = options.rows ?? [];
  const fixture = TestBed.createComponent(StatsPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, repo, toastShown, query };
}

function paged(rows: StatEntry[]): PagedResult<StatEntry> {
  return { content: rows, pageIndex: 0, pageSize: 25, totalElements: rows.length, totalPages: 1 };
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
    expect(page.saveStates().session.status).toBe('saved');
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

  // #349 : screened upstream on a GUS, so it rides with the other flags rather than on its own.
  it('saves the institutions flag like the other three', () => {
    const { page, repo } = setup({ rows: [makePending({ highInstitutions: false })] });

    page.toggleFlag('highInstitutions', true);

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ highInstitutions: true }),
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

    expect(page.sessionIssue()?.reason).toBe('stats.save.hodBelowLod');
    expect(repo.update).not.toHaveBeenCalled();
  });

  // #305 : the HOD / LOD pair was the only check, so a HOD of 1 under a push of 10 went through
  // and could even be ticked — physically impossible on a single day.
  it('refuses a price outside the day it belongs to, and names the fields', () => {
    const { page, repo } = setup({ rows: [makePending()] });
    fillSession(page);

    // The issue's own case : open 4.20, push 4.62, HOD 1 — and no LOD yet, so the HOD / LOD rule
    // stays quiet and this one has to speak.
    page.setSessionPrice('lodPrice', null);
    page.setSessionPrice('hodPrice', 1);

    expect(page.sessionIssue()).toEqual({
      reason: 'stats.save.aboveHod',
      fields: ['openPrice', 'pushOpenPrice', 'eodPrice', 'hodPrice'],
    });
    expect(page.atFault('pushOpenPrice')).toBe(true);
    expect(page.atFault('lodPrice')).toBe(false);

    page.saveSession();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('refuses an EOD under the LOD', () => {
    const { page } = setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('eodPrice', 1);

    expect(page.sessionIssue()).toEqual({
      reason: 'stats.save.belowLod',
      fields: ['eodPrice', 'lodPrice'],
    });
  });

  // The ✓ answers for both reasons, and its tooltip is what the wrapper shows (#308).
  it('keeps the ✓ out of reach while the set is impossible, and says why', () => {
    const { page } = setup({ rows: [makePending()] });
    fillSession(page);
    expect(page.tickBlockedReason()).toBe('');

    // HOD above the LOD, but under the prices it should contain.
    page.setSessionPrice('lodPrice', 1);
    page.setSessionPrice('hodPrice', 2);

    expect(page.tickBlockedReason()).toBe('stats.save.aboveHod');
  });

  // A row stored before the rule existed : the table's ✓ must answer for it too, not just the
  // panel's — and the backend replays the rule when the tick lands (#305).
  it("keeps the table ✓ out of reach on a row the day's range refuses", () => {
    // Every price is in — a missing one would be reported first, and rightly so — but the open,
    // the push and the EOD all sit above a HOD of 1.
    const impossible = makeStat({ hodPrice: 1, lodPrice: 0.9 });
    const { page } = setup({ rows: [impossible] });

    expect(page.rows()[0].issue).toBe('stats.save.aboveHod');
    expect(page.rowBlockedReason(page.rows()[0])).toBe('stats.save.aboveHod');
  });

  it('names the HOD / LOD inversion rather than the prices it drags along', () => {
    const { page } = setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('hodPrice', 1);

    expect(page.sessionIssue()).toEqual({
      reason: 'stats.save.hodBelowLod',
      fields: ['hodPrice', 'lodPrice'],
    });
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

  // #383 : filtered to SGBX, the panel still edited BNRG — whatever was typed landed off screen.
  it('closes the panel when a filter change leaves its stat off the table', () => {
    const { fixture, page, repo } = setup({ rows: [makePending()] });
    expect(page.completing()?.id).toBe('stat-sgbx');

    repo.rows = [makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })];
    page.setStatus('COMPLETED');
    fixture.detectChanges();

    expect(page.completing()).toBeNull();
  });

  it('closes the panel when a page change takes its stat off the table', () => {
    const { fixture, page, repo } = setup({ rows: [makePending()] });

    repo.rows = [makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })];
    page.onPage({ pageIndex: 1, pageSize: 25, length: 30 });
    fixture.detectChanges();

    expect(page.completing()).toBeNull();
  });

  // Asking would leave « cancel » editing a row the table no longer shows : the edit the validation
  // held back could never be saved anyway, so it goes, out loud.
  it('drops an edit the validation held back when its stat leaves the table, and says so', () => {
    const ktta = makeStat();
    const { fixture, page, repo, toastShown } = setup({ rows: [ktta] });
    page.open(ktta);
    page.setSessionPrice('hodPrice', 3.2);

    repo.rows = [makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })];
    page.setStatus('COMPLETED');
    fixture.detectChanges();

    expect(page.completing()).toBeNull();
    expect(toastShown).toHaveBeenCalledWith('error', 'stats.snackbar.editDropped');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('stays on a stat just ticked, even once it leaves the tab', () => {
    const full = makeStat({ id: 'stat-bnrg', ticker: 'BNRG', completed: false });
    const { fixture, page, repo } = setup({ rows: [full], query: { status: 'TO_COMPLETE' } });
    expect(page.completing()?.id).toBe('stat-bnrg');

    // Ticked, it is no longer « to complete » : the reload under the same tab comes back without it.
    repo.rows = [];
    page.toggleCompleted(full);
    fixture.detectChanges();

    expect(page.completing()?.id).toBe('stat-bnrg');
  });

  // #383 : « In stats » on a candidate links here, to the stat it became.
  it('opens the panel on the stat named in the URL, even when it is not on the page', () => {
    const { page, repo } = setup({ rows: [makePending()], query: { stat: 'stat-ktta' } });

    expect(repo.findById).toHaveBeenCalledWith('stat-ktta');
    expect(page.completing()?.id).toBe('stat-ktta');
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

  // #337 : « Complete » on the Today page lands on the stats still to complete.
  it('opens on the tab named in the URL', () => {
    const { page, repo } = setup({ query: { status: 'TO_COMPLETE' } });

    expect(page.status()).toBe('TO_COMPLETE');
    expect(repo.lastFilter?.status).toBe('TO_COMPLETE');
  });

  it('falls back to every stat on a tab the URL names wrong', () => {
    const { page } = setup({ query: { status: 'SOMEDAY' } });

    expect(page.status()).toBeNull();
  });

  it('follows the URL when it changes under the same page', () => {
    const { fixture, page, query } = setup({ query: { status: 'TO_COMPLETE' } });

    query.next(convertToParamMap({ status: 'COMPLETED' }));
    fixture.detectChanges();

    expect(page.status()).toBe('COMPLETED');
  });

  // #370 : the table was unmounted for the length of every refetch, which read as a page reload.
  it('keeps the rows on screen, dimmed, while a filter change refetches', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    repo.findAll.mockReturnValue(new Subject<PagedResult<StatEntry>>());

    page.setStatus('COMPLETED');
    fixture.detectChanges();

    const table: HTMLElement | null = fixture.nativeElement.querySelector('.stb-table');
    expect(table?.classList).toContain('stb-table--busy');
    expect(fixture.nativeElement.querySelector('.loading-state')).toBeNull();
    expect(page.rows().map((r) => r.ticker)).toEqual(['KTTA']);
  });

  it('drops the answer of a filter changed again before it arrived', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    const first = new Subject<PagedResult<StatEntry>>();
    const second = new Subject<PagedResult<StatEntry>>();
    repo.findAll.mockReturnValueOnce(first).mockReturnValueOnce(second);

    page.setStatus('COMPLETED');
    fixture.detectChanges();
    page.setStatus('TO_COMPLETE');
    fixture.detectChanges();
    // The slower, older request answers last : it used to overwrite the newer result.
    second.next(paged([makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })]));
    first.next(paged([makeStat({ id: 'stat-slnh', ticker: 'SLNH' })]));

    expect(page.rows().map((r) => r.ticker)).toEqual(['BNRG']);
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

  // #334 : on this tab the average push read « — » over « 0 that pushed ».
  it('the « No push » tab rates the no-push days over every completed stat of the period', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    repo.summary.mockImplementation((filter?: StatEntryFilter) =>
      of(
        filter?.noPush
          ? makeSummary({ completed: 1, noPushCount: 1 })
          : makeSummary({ completed: 11, noPushCount: 1 }),
      ),
    );

    page.setStatus('NO_PUSH');
    fixture.detectChanges();

    expect(repo.summary).toHaveBeenLastCalledWith(expect.objectContaining({ noPush: null }));
    expect(page.noPushRate()?.count).toBe(1);
    expect(page.noPushRate()?.total).toBe(11);
    expect(page.noPushRate()?.share).toBeCloseTo(9.09, 2);
    expect(fixture.nativeElement.textContent).toContain('stats.kpi.noPushDays');
  });

  // A search for SGBX made it « 1 / 1 · 100 % of the period » : one ticker over itself.
  it('rates the no-push days over the period whatever the search box holds', () => {
    vi.useFakeTimers();
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    page.setStatus('NO_PUSH');
    page.onSearchInput('SGBX');
    vi.advanceTimersByTime(250); // the search box is debounced
    fixture.detectChanges();
    vi.useRealTimers();

    expect(repo.lastFilter?.query).toBe('SGBX');
    expect(repo.summary).toHaveBeenLastCalledWith(
      expect.objectContaining({ noPush: null, query: null }),
    );
  });

  it('forgets the rate once the tab is left, so it never comes back stale', () => {
    const { fixture, page } = setup({ rows: [makeStat()] });
    page.setStatus('NO_PUSH');
    fixture.detectChanges();
    expect(page.noPushRate()).not.toBeNull();

    page.setStatus(null);
    fixture.detectChanges();

    expect(page.noPushRate()).toBeNull();
  });

  it('shows a dash rather than « 0 / 0 » on a period with no completed stat', () => {
    const { fixture, page, repo } = setup({ rows: [makeStat()] });
    repo.summary.mockReturnValue(of(makeSummary({ completed: 0, noPushCount: 0 })));

    page.setStatus('NO_PUSH');
    fixture.detectChanges();

    expect(page.noPushRate()?.share).toBeNull();
    expect(fixture.nativeElement.querySelector('.kpi__value[aria-busy]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('0 / 0');
  });

  it('the other tabs keep the average push and fetch no period summary', () => {
    const { repo, page } = setup({ rows: [makeStat()] });

    expect(repo.summary).toHaveBeenCalledTimes(1);
    expect(page.noPushRate()).toBeNull();
  });

  // ---- Premarket card (#326) ----

  it('saves a premarket fix with the whole row and marks the premarket card saved', () => {
    const { page, repo } = setup({ rows: [makePending()] });

    page.setPremarketPrice('pmHigh', 4.8);
    page.saveSession('premarket');

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ pmHigh: 4.8, ticker: 'SGBX' }),
    );
    expect(page.saveStates().premarket.status).toBe('saved');
  });

  // #393 : a ticker captured as GUS that turned out to be a double top gets re-filed.
  it('re-files a stat under another pattern as soon as it is picked, with the whole row', () => {
    const { page, repo } = setup({ rows: [makePending()] });

    page.setPremarketPattern('DT');

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ pattern: 'DT', ticker: 'SGBX', pmOpen: expect.any(Number) }),
    );
    expect(page.saveStates().premarket.status).toBe('saved');
  });

  it('refuses a PM high under the PM open without sending anything', () => {
    const { page, repo } = setup({ rows: [makePending()] });

    page.setPremarketPrice('pmHigh', 1.0);
    page.saveSession('premarket');

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.saveStates().premarket).toEqual(
      expect.objectContaining({ status: 'error', reason: 'stats.save.pmHighBelowPmOpen' }),
    );
  });

  // ---- An emptied premarket price (#340) ----

  // Clearing a price to retype it : the field and the card both say why nothing goes out.
  it('marks an emptied premarket price as required and sends nothing', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta] });
    page.open(ktta);

    page.setPremarketPrice('previousClose', null);
    page.saveSession('premarket');

    expect(page.premarketRequired().previousClose).toBe(true);
    expect(repo.update).not.toHaveBeenCalled();
    expect(page.saveStates().premarket).toEqual(
      expect.objectContaining({ status: 'error', reason: 'stats.save.premarketRequired' }),
    );
  });

  // The whole row goes back on every save : a session edit would carry the empty premarket along.
  it('holds a session edit while the premarket is incomplete, and says so', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta] });
    page.open(ktta);
    page.setPremarketPrice('previousClose', null);

    page.setSessionPrice('eodPrice', 3.6);
    page.saveSession('session');

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.saveStates().session).toEqual(
      expect.objectContaining({ status: 'error', reason: 'stats.save.waitingPremarket' }),
    );
  });

  it('closes on « leave without saving », the row keeping its saved premarket', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta] });
    page.open(ktta);
    page.setPremarketPrice('previousClose', null);
    page.setPremarketPrice('floatMillions', 6.0);

    page.close();

    expect(page.completing()).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
    expect(page.entries()[0]).toEqual(
      expect.objectContaining({ previousClose: 2.65, floatMillions: 8.2 }),
    );
  });

  // The same hole from the session side : a transposed HOD / LOD holds a float edit too.
  it('holds a premarket edit while the HOD is below the LOD, and says so', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta] });
    page.open(ktta);
    page.setSessionPrice('hodPrice', 3.2);

    page.setPremarketPrice('floatMillions', 6.0);
    page.saveSession('premarket');

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.saveStates().premarket).toEqual(
      expect.objectContaining({ status: 'error', reason: 'stats.save.waitingSession' }),
    );
  });

  // The guard reads what never left, whichever validation held it back — not the premarket alone.
  it('asks before closing on a HOD below the LOD, and stays open when cancelled', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta], confirmed: false });
    page.open(ktta);
    page.setSessionPrice('hodPrice', 3.2);
    page.setSessionPrice('eodPrice', 3.6);

    page.close();

    expect(page.completing()?.id).toBe(ktta.id);
    expect(page.session().eodPrice).toBe(3.6);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('closes without asking once every edit is saved', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta], confirmed: false });
    page.open(ktta);
    page.setPremarketPrice('floatMillions', 6.0);

    page.close();

    expect(repo.update).toHaveBeenCalledTimes(1);
    // A premarket-only edit lights the premarket card, not the session one.
    expect(page.saveStates().premarket.status).toBe('saved');
    expect(page.completing()).toBeNull();
  });

  // #348, on the recovery path of #340 : the whole row goes out with the premarket, so the session
  // card is no longer waiting for anything — saying it still is, at the very moment the user checks
  // whether their edits made it, invites retyping what is already in.
  it('releases the session card once the premarket it was waiting for is saved', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta] });
    page.open(ktta);
    page.setPremarketPrice('previousClose', null);
    page.setSessionPrice('eodPrice', 3.6);
    page.saveSession('session');
    expect(page.saveStates().session.reason).toBe('stats.save.waitingPremarket');

    page.setPremarketPrice('previousClose', 2.7);
    page.saveSession('premarket');

    expect(repo.update).toHaveBeenCalledWith(
      'stat-ktta',
      expect.objectContaining({ previousClose: 2.7, eodPrice: 3.6 }),
    );
    expect(page.saveStates().premarket.status).toBe('saved');
    expect(page.saveStates().session.status).toBe('saved');
  });

  it('leaves a card blocked on a reason of its own alone', () => {
    const ktta = makeStat();
    const { page } = setup({ rows: [ktta] });
    page.open(ktta);
    page.setSessionPrice('hodPrice', 3.2);
    page.saveSession('session');
    expect(page.saveStates().session.reason).toBe('stats.save.hodBelowLod');

    page.setPremarketPrice('floatMillions', 6.0);
    page.saveSession('premarket');

    // Nothing was saved — the premarket is the one held now — and the session keeps its own error.
    expect(page.saveStates().session.reason).toBe('stats.save.hodBelowLod');
    expect(page.saveStates().premarket.reason).toBe('stats.save.waitingSession');
  });

  // ---- The save cue states its day (#342) ----

  // NUKK last saved yesterday evening : « saved at 22:25 » read as if it had just happened.
  it('says « yesterday » on a stat last saved the day before', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 25);
    const nukk = makeStat({ ticker: 'NUKK', updatedAt: yesterday });
    const { page } = setup({ rows: [nukk] });
    page.open(nukk);

    expect(page.saveLabel(page.saveStates().premarket)).toBe('stats.save.savedYesterdayAt');
    expect(page.saveLabel(page.saveStates().session)).toBe('stats.save.savedYesterdayAt');
  });

  it('gives the date on a stat last saved before yesterday, the time alone today', () => {
    const { page } = setup({ rows: [] });

    expect(
      page.saveLabel({ status: 'saved', at: new Date(2026, 7, 10, 18, 5), reason: null }),
    ).toBe('stats.save.savedOnAt');
    expect(page.saveLabel({ status: 'saved', at: new Date(), reason: null })).toBe(
      'stats.save.savedAt',
    );
  });

  it('stays open with the pending edits when leaving is cancelled', () => {
    const ktta = makeStat();
    const { page, repo } = setup({ rows: [ktta], confirmed: false });
    page.open(ktta);
    page.setPremarketPrice('previousClose', null);
    page.setPremarketPrice('floatMillions', 6.0);

    page.close();

    expect(page.completing()?.id).toBe(ktta.id);
    expect(page.premarket().floatMillions).toBe(6.0);
    expect(repo.update).not.toHaveBeenCalled();
  });

  // ---- New stat (#326) ----

  // GLND, three days back : found on the charts, never captured as a candidate.
  it('creates a stat typed by hand once confirmed, then carries on with it', () => {
    const { page, repo } = setup({ rows: [] });
    page.startNew();
    expect(page.createMissing()).toEqual(['stats.fields.ticker', 'stats.create.premarketPrices']);

    page.setIdentity({ ticker: 'glnd', tradeDate: new Date(2026, 8, 18) });
    page.setPremarketPrice('previousClose', 1.96);
    page.setPremarketPrice('pmOpen', 3.1);
    page.setPremarketPrice('pmHigh', 3.48);
    page.setSessionPrice('openPrice', 3.1);
    page.createStat();

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'GLND',
        tradeDate: new Date(2026, 8, 18),
        pmHigh: 3.48,
        openPrice: 3.1,
      }),
    );
    expect(page.creating()).toBe(false);
    expect(page.completing()?.id).toBe('stat-new');
  });

  it('never saves a field of a stat not created yet', () => {
    const { page, repo } = setup({ rows: [] });
    page.startNew();

    page.setPremarketPrice('previousClose', 1.96);
    page.saveSession('premarket');

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('creates nothing when the confirmation is cancelled', () => {
    const { page, repo } = setup({ rows: [], confirmed: false });
    page.startNew();
    page.setIdentity({ ticker: 'GLND' });
    page.setPremarketPrice('previousClose', 1.96);
    page.setPremarketPrice('pmOpen', 3.1);
    page.setPremarketPrice('pmHigh', 3.48);

    page.createStat();

    expect(repo.create).not.toHaveBeenCalled();
    expect(page.creating()).toBe(true);
  });
});
