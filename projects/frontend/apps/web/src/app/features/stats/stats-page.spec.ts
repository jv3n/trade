import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { StbConfirmPick, StbToast, provideNativeDateAdapter } from '@portfolioai/ui';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import { Pattern } from '../../core/api/shared/pattern.model';
import { DayChart } from '../../core/api/stats/day-chart.model';
import {
  PageRequest,
  PagedResult,
  REJECTION_NOTE_MAX_LENGTH,
  REJECTION_REASONS,
  RuleScore,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatRejectionReason,
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
 * - **Views (#437)** — GUS / DT / All pick the pattern of the listing and the KPIs, the columns and
 *   the averages row ; « No push » is a GUS tab ; a link or a new stat moves to the view it shows in.
 * - **Double top card (#437)** — a DT stat is filled with its four prices, the legs computed live,
 *   ticked with all four ; its shape is checked before anything is sent, and it is never re-filed.
 * - **No push (#302)** — ticking it empties the push and takes it out of the prices a stat needs ;
 *   unticking gives the typed push back ; the « No push » tab is its own filter axis, and its push
 *   KPI rates the no-push days over the whole period (#334).
 * - **The scanner's stats (#764)** — tagged and tinted while to review, never opened on their own nor
 *   ticked before « Valider » ; Valider needs no confirmation, Rejeter asks with the reasons of the
 *   stat's pattern ; « À relire » opens on « All » with its count, « Rejetées » adds the rejected.
 *
 * The listing and the KPIs load through resources (#375), which answer a microtask after the call :
 * `setup()` and `settle()` wait for them before a test reads the page.
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
    note: 'Résistance 4,65',
    openPrice: 4.2,
    pushOpenPrice: 4.62,
    hodPrice: 4.62,
    lodPrice: 3.41,
    eodPrice: 3.52,
    dtStartPrice: null,
    dtTopPrice: null,
    dtLowPrice: null,
    dtRetestPrice: null,
    dtStartTime: null,
    dtTopTime: null,
    dtLowTime: null,
    dtRetestTime: null,
    dtDropPrice: null,
    dtDropTime: null,
    pushOpenTime: null,
    gusDropPrice: null,
    gusDropTime: null,
    ssr: false,
    under1Dollar: false,
    highInstitutions: true,
    noPush: false,
    dropNotRead: false,
    completed: true,
    outOfPattern: [],
    trades: [],
    source: 'MANUAL',
    review: null,
    rejectionReason: null,
    rejectionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * SGBX of `mockup/stats.html`, its double top late in the morning : start 1.90, top 2.95, rejection
 * low 2.36, the retest still to come — off a 1.12 previous close. Dated 12/10, the first day the
 * drop is asked for (#726).
 */
function makeDoubleTop(overrides: Partial<StatEntry> = {}): StatEntry {
  return makePending({
    id: 'stat-sgbx-dt',
    pattern: 'DT',
    tradeDate: DT_DROP_DAY,
    previousClose: null,
    pmOpen: null,
    pmHigh: null,
    dtStartPrice: 1.9,
    dtTopPrice: 2.95,
    dtLowPrice: 2.36,
    dtStartTime: '10:02',
    dtTopTime: '10:14',
    dtLowTime: '10:21',
    ...overrides,
  });
}

/** The first day the double top's drop is asked for (#726) — the fixtures' 17/09 is before it. */
const DT_DROP_DAY = new Date(2026, 9, 12);

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
    medianLodPercent: -12.3,
    fadeCount: 7,
    medianEodPercent: -3.7,
    medianHoldPercent: -17.3,
    medianCumulativePmHighPercent: 74.9,
    medianCumulativeOpenPercent: 42.9,
    completedDoubleTops: 0,
    averageExtensionPercent: null,
    averageRejectionPercent: null,
    rejectionAtCriterionCount: 0,
    averageRetestPercent: null,
    averageRetestToTopPercent: null,
    retestTookTopCount: 0,
    doubleTopsTookTopWithoutDrop: 0,
    doubleTopsDropNotAsked: 0,
    doubleTopsDropNotRead: 0,
    medianDoubleTopMinutes: null,
    medianRejectionMinutes: null,
    doubleTopsWithDrop: 0,
    dropsAfterTookTop: 0,
    medianDropPercent: null,
    medianDropFromEntryPercent: null,
    medianDropMinutes: null,
    dropReachedTargetCount: 0,
    sessionsWithDrop: 0,
    sessionsDropNotRead: 0,
    medianGusDropPercent: null,
    gusDropReachedTargetCount: 0,
    sessionsWithPushTime: 0,
    medianPushMinutes: null,
    medianGusDropMinutes: null,
    traded: 8,
    toReview: 0,
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
  dayChart = vi.fn((_id: string): Observable<DayChart> =>
    of({ ticker: 'KTTA', state: 'PENDING', bars: [] }),
  );
  summary = vi.fn((_filter?: StatEntryFilter): Observable<StatSummary> => of(makeSummary()));
  countToReview = vi.fn((_filter?: StatEntryFilter): Observable<number> => of(0));
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
  validate = vi.fn((id: string): Observable<StatEntry> =>
    of({ ...this.row(id), review: 'VALIDATED' as const }),
  );
  reject = vi.fn((id: string, reason: StatRejectionReason | null): Observable<StatEntry> =>
    of({ ...this.row(id), review: 'REJECTED' as const, rejectionReason: reason }),
  );
  restore = vi.fn((id: string): Observable<StatEntry> =>
    of({ ...this.row(id), review: 'TO_REVIEW' as const, rejectionReason: null }),
  );
  delete = vi.fn((_id: string): Observable<void> => of(undefined));
  promoteToTrade = vi.fn((_id: string): Observable<TradeEntry> =>
    of({ id: 'trade-1' } as TradeEntry),
  );
  createSibling = vi.fn((_id: string, pattern: Pattern): Observable<StatEntry> =>
    of(makeStat({ id: 'stat-sibling', pattern, pushOpenPrice: null, completed: false })),
  );
  freePatterns = vi.fn((_id: string): Observable<Pattern[]> => of(['DT']));
  exportCsv = vi.fn((): Observable<Blob> => of(new Blob()));
  ruleScore = vi.fn((): Observable<RuleScore> => throwError(() => new Error('not used')));

  private row(id: string): StatEntry {
    return this.rows.find((r) => r.id === id) ?? makeStat({ id });
  }
}

async function setup(
  options: {
    rows?: StatEntry[];
    confirmed?: boolean;
    /** What the rejection's confirmation answers — confirmed with no reason by default. */
    pick?: StbConfirmPick;
    query?: Record<string, string>;
    /** What `?stat=` fetches — by default a GUS stat with the asked id. */
    byId?: StatEntry;
    /** The first listing answer, held back — a first load still running. */
    firstAnswer?: Observable<PagedResult<StatEntry>>;
  } = {},
): Promise<{
  fixture: ComponentFixture<StatsPage>;
  page: StatsPage;
  repo: MockStatsRepository;
  toastShown: ReturnType<typeof vi.fn>;
  query: BehaviorSubject<ParamMap>;
}> {
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
      {
        provide: ConfirmService,
        useValue: {
          ask: () => of(options.confirmed ?? true),
          choose: () => of(options.pick ?? { confirmed: true, value: null, note: null }),
        },
      },
      // Only when a test names a query : the rows' `routerLink` needs the real route otherwise.
      ...(options.query ? [{ provide: ActivatedRoute, useValue: { queryParamMap: query } }] : []),
    ],
  });
  const repo = TestBed.inject(StatsRepository) as MockStatsRepository;
  repo.rows = options.rows ?? [];
  if (options.byId) repo.findById.mockReturnValue(of(options.byId));
  if (options.firstAnswer) repo.findAll.mockReturnValueOnce(options.firstAnswer);
  const fixture = TestBed.createComponent(StatsPage);
  // A first answer held back would keep the page from ever settling.
  if (options.firstAnswer) fixture.detectChanges();
  else await settle(fixture);
  return { fixture, page: fixture.componentInstance, repo, toastShown, query };
}

/** Renders once the listing and the KPIs have answered — a resource resolves a tick after its call. */
async function settle(fixture: ComponentFixture<StatsPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
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

  it('loads the listing and the KPIs of the same filter on init', async () => {
    const { repo, page } = await setup({ rows: [makeStat()] });

    expect(repo.findAll).toHaveBeenCalledTimes(1);
    expect(repo.summary).toHaveBeenCalledTimes(1);
    expect(repo.summary.mock.calls[0][0]).toEqual(repo.lastFilter);
    expect(page.summary()?.completed).toBe(10);
  });

  it('derives the premarket and session percentages of each row', async () => {
    const { page } = await setup({ rows: [makeStat()] });

    const row = page.rows()[0];
    expect(row.gap).toBeCloseTo(52.83, 2);
    expect(row.pmPush).toBeCloseTo(14.81, 2);
    expect(row.pushOpenPercent).toBeCloseTo(10, 5);
    expect(row.lodPercent).toBeCloseTo(-18.81, 2);
    expect(row.eodPercent).toBeCloseTo(-16.19, 2);
  });

  // #499 : the scanner reads close → price right now, so the 45 % rule needs the cumulative figure.
  it('derives the cumulative readings and the hold of each row from its prices', async () => {
    const { page } = await setup({ rows: [makeStat()] });

    const row = page.rows()[0];
    // KTTA : close 2.65, PM high 4.65, open 4.20.
    expect(row.cumulativePmHigh).toBeCloseTo(75.47, 2);
    expect(row.cumulativeOpen).toBeCloseTo(58.49, 2);
    expect(row.hold).toBeCloseTo(-9.68, 2);
  });

  it('has no hold and no cumulative at the open before the open is typed', async () => {
    const { page } = await setup({ rows: [makePending()] });

    const row = page.rows()[0];
    expect(row.hold).toBeNull();
    expect(row.cumulativeOpen).toBeNull();
    expect(row.cumulativePmHigh).not.toBeNull();
  });

  it('shows an error banner when the listing fails', async () => {
    const { fixture, page, repo } = await setup();
    repo.findAll.mockReturnValue(throwError(() => new Error('500 from server')));

    page.setStatus('COMPLETED');
    await settle(fixture);

    expect(page.error()).toBe(true);
    expect(page.rows()).toEqual([]);
  });

  // ---- Session panel ----

  it('opens the session panel on the first stat still to complete', async () => {
    const pending = makePending();
    const { page } = await setup({ rows: [makeStat(), pending] });

    expect(page.completing()?.id).toBe(pending.id);
    expect(page.session().openPrice).toBeNull();
  });

  it('previews the hold and the cumulative at the open under the open, read off the premarket', async () => {
    const { page } = await setup({ rows: [makePending()] });

    expect(page.openPercents()).toEqual({ hold: null, cumulative: null });
    page.setSessionPrice('openPrice', 4.2);

    expect(page.openPercents().hold).toBeCloseTo(-9.68, 2);
    expect(page.openPercents().cumulative).toBeCloseTo(58.49, 2);
    expect(page.premarketPercents().cumulativePmHigh).toBeCloseTo(75.47, 2);
  });

  it('saves the whole row when a field is left — session updated, premarket untouched', async () => {
    const pending = makePending();
    const { page, repo } = await setup({ rows: [pending] });

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

  it('saves a flag as soon as it is ticked', async () => {
    const { page, repo } = await setup({ rows: [makePending()] });

    page.toggleFlag('ssr', true);

    expect(repo.update).toHaveBeenCalledWith('stat-sgbx', expect.objectContaining({ ssr: true }));
  });

  // #349 : screened upstream on a GUS, so it rides with the other flags rather than on its own.
  it('saves the institutions flag like the other two', async () => {
    const { page, repo } = await setup({ rows: [makePending({ highInstitutions: false })] });

    page.toggleFlag('highInstitutions', true);

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ highInstitutions: true }),
    );
  });

  it('sends nothing when a field is left unchanged', async () => {
    const { page, repo } = await setup({ rows: [makePending()] });

    page.saveSession();

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('sends nothing while the HOD is below the LOD', async () => {
    const { page, repo } = await setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('hodPrice', 3.2);
    page.saveSession();

    expect(page.sessionIssue()?.reason).toBe('stats.save.hodBelowLod');
    expect(repo.update).not.toHaveBeenCalled();
  });

  // #305 : the HOD / LOD pair was the only check, so a HOD of 1 under a push of 10 went through
  // and could even be ticked — physically impossible on a single day.
  it('refuses a price outside the day it belongs to, and names the fields', async () => {
    const { page, repo } = await setup({ rows: [makePending()] });
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

  it('refuses an EOD under the LOD', async () => {
    const { page } = await setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('eodPrice', 1);

    expect(page.sessionIssue()).toEqual({
      reason: 'stats.save.belowLod',
      fields: ['eodPrice', 'lodPrice'],
    });
  });

  // The ✓ answers for both reasons, and its tooltip is what the wrapper shows (#308).
  it('keeps the ✓ out of reach while the set is impossible, and says why', async () => {
    const { page } = await setup({ rows: [makePending()] });
    fillSession(page);
    expect(page.tickBlockedReason()).toBe('');

    // HOD above the LOD, but under the prices it should contain.
    page.setSessionPrice('lodPrice', 1);
    page.setSessionPrice('hodPrice', 2);

    expect(page.tickBlockedReason()).toBe('stats.save.aboveHod');
  });

  // A row stored before the rule existed : the table's ✓ must answer for it too, not just the
  // panel's — and the backend replays the rule when the tick lands (#305).
  it("keeps the table ✓ out of reach on a row the day's range refuses", async () => {
    // Every price is in — a missing one would be reported first, and rightly so — but the open,
    // the push and the EOD all sit above a HOD of 1.
    const impossible = makeStat({ hodPrice: 1, lodPrice: 0.9 });
    const { page } = await setup({ rows: [impossible] });

    expect(page.rows()[0].issue).toBe('stats.save.aboveHod');
    expect(page.rowBlockedReason(page.rows()[0])).toBe('stats.save.aboveHod');
  });

  it('names the HOD / LOD inversion rather than the prices it drags along', async () => {
    const { page } = await setup({ rows: [makePending()] });
    fillSession(page);

    page.setSessionPrice('hodPrice', 1);

    expect(page.sessionIssue()).toEqual({
      reason: 'stats.save.hodBelowLod',
      fields: ['hodPrice', 'lodPrice'],
    });
  });

  it('previews each session price against the open while typing', async () => {
    const { page } = await setup({ rows: [makePending()] });
    fillSession(page);

    const percents = page.sessionPercents();
    expect(percents.pushOpen).toBeCloseTo(10, 5);
    expect(percents.lod).toBeCloseTo(-18.81, 2);
  });

  it('counts the prices in and names the missing ones', async () => {
    const { page } = await setup({ rows: [makePending()] });

    page.setSessionPrice('openPrice', 1.9);
    page.setSessionPrice('pushOpenPrice', 2.2);

    expect(page.sessionFilled()).toBe(2);
    expect(page.sessionMissing()).toEqual([
      'stats.fields.hod',
      'stats.fields.lod',
      'stats.fields.eod',
    ]);
  });

  it('Close saves the field being typed, then stops the panel re-opening on that stat', async () => {
    const { fixture, page, repo } = await setup({ rows: [makePending()] });
    page.setSessionPrice('openPrice', 1.9);

    page.close();

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ openPrice: 1.9 }),
    );
    expect(page.completing()).toBeNull();
    // A refetch (here : a filter change) must not bring the closed stat back.
    page.setStatus('TO_COMPLETE');
    await settle(fixture);
    expect(page.completing()).toBeNull();
  });

  it('refuses to clear a price of a ticked stat and puts the value back', async () => {
    const ticked = makeStat({ completed: true });
    const { page, repo, toastShown } = await setup({ rows: [ticked] });
    page.open(ticked);

    page.setSessionPrice('eodPrice', null);
    page.saveSession();

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.session().eodPrice).toBe(3.52);
    expect(toastShown.mock.calls.at(-1)?.[0]).toBe('error');
  });

  it('puts the row back and toasts an error when a save fails', async () => {
    const { page, repo, toastShown } = await setup({ rows: [makePending()] });
    repo.update.mockReturnValue(throwError(() => new Error('500 from server')));

    page.setSessionPrice('openPrice', 1.9);
    page.saveSession();

    expect(toastShown.mock.calls.at(-1)?.[0]).toBe('error');
    expect(page.rows()[0].openPrice).toBeNull();
    expect(page.session().openPrice).toBeNull();
    expect(page.completing()).not.toBeNull();
  });

  // ---- The ✓ (#263) ----

  it('lists what a row misses before it can be ticked', async () => {
    const { page } = await setup({ rows: [makePending({ openPrice: 1.9, pushOpenPrice: 2.2 })] });

    expect(page.rows()[0].missing).toEqual([
      'stats.fields.hod',
      'stats.fields.lod',
      'stats.fields.eod',
    ]);
  });

  // #383 : filtered to SGBX, the panel still edited BNRG — whatever was typed landed off screen.
  it('closes the panel when a filter change leaves its stat off the table', async () => {
    const { fixture, page, repo } = await setup({ rows: [makePending()] });
    expect(page.completing()?.id).toBe('stat-sgbx');

    repo.rows = [makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })];
    page.setStatus('COMPLETED');
    await settle(fixture);

    expect(page.completing()).toBeNull();
  });

  it('closes the panel when a page change takes its stat off the table', async () => {
    const { fixture, page, repo } = await setup({ rows: [makePending()] });

    repo.rows = [makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })];
    page.onPage({ pageIndex: 1, pageSize: 25, length: 30 });
    await settle(fixture);

    expect(page.completing()).toBeNull();
  });

  // Asking would leave « cancel » editing a row the table no longer shows : the edit the validation
  // held back could never be saved anyway, so it goes, out loud.
  it('drops an edit the validation held back when its stat leaves the table, and says so', async () => {
    const ktta = makeStat();
    const { fixture, page, repo, toastShown } = await setup({ rows: [ktta] });
    page.open(ktta);
    page.setSessionPrice('hodPrice', 3.2);

    repo.rows = [makeStat({ id: 'stat-bnrg', ticker: 'BNRG' })];
    page.setStatus('COMPLETED');
    await settle(fixture);

    expect(page.completing()).toBeNull();
    expect(toastShown).toHaveBeenCalledWith('error', 'stats.snackbar.editDropped');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('stays on a stat just ticked, even once it leaves the tab', async () => {
    const full = makeStat({ id: 'stat-bnrg', ticker: 'BNRG', completed: false });
    const { fixture, page, repo } = await setup({ rows: [full], query: { status: 'TO_COMPLETE' } });
    expect(page.completing()?.id).toBe('stat-bnrg');

    // Ticked, it is no longer « to complete » : the reload under the same tab comes back without it.
    repo.rows = [];
    page.toggleCompleted(full);
    await settle(fixture);

    expect(page.completing()?.id).toBe('stat-bnrg');
  });

  // #383 : « In stats » on a candidate links here, to the stat it became.
  it('opens the panel on the stat named in the URL, even when it is not on the page', async () => {
    const { page, repo } = await setup({ rows: [makePending()], query: { stat: 'stat-ktta' } });

    expect(repo.findById).toHaveBeenCalledWith('stat-ktta');
    expect(page.completing()?.id).toBe('stat-ktta');
  });

  it('ticks a stat with its five prices, then reloads the list', async () => {
    const full = makeStat({ id: 'stat-bnrg', ticker: 'BNRG', completed: false });
    const { fixture, page, repo } = await setup({ rows: [full] });
    const fetchesBefore = repo.findAll.mock.calls.length;

    page.toggleCompleted(full);
    await settle(fixture); // the fetch effect re-runs on change detection

    expect(repo.setCompleted).toHaveBeenCalledWith('stat-bnrg', true);
    // How many times the effect fires under the test's change detection is not the point — that
    // the list is fetched again after the tick is.
    expect(repo.findAll.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it('unticks a completed stat', async () => {
    const ticked = makeStat({ completed: true });
    const { page, repo } = await setup({ rows: [ticked] });

    page.toggleCompleted(ticked);

    expect(repo.setCompleted).toHaveBeenCalledWith('stat-ktta', false);
  });

  it('never ticks a stat that misses a price', async () => {
    const pending = makePending();
    const { page, repo } = await setup({ rows: [pending] });

    page.toggleCompleted(pending);

    expect(repo.setCompleted).not.toHaveBeenCalled();
  });

  it('sends the last field before the tick, one write at a time', async () => {
    const pending = makePending({
      openPrice: 4.2,
      pushOpenPrice: 4.62,
      hodPrice: 4.62,
      lodPrice: 3.41,
    });
    const { page, repo } = await setup({ rows: [pending] });
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

  it('deletes a stat once the confirmation modal is confirmed', async () => {
    const { page, repo } = await setup({ rows: [makeStat()] });

    page.delete(makeStat());

    expect(repo.delete).toHaveBeenCalledWith('stat-ktta');
  });

  // #675 review : only the listing is keyed on the page — the KPIs kept counting the deleted stat.
  it('deleting the last row of a later page steps back a page, and reloads the KPIs too', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    page.pageIndex.set(2);
    await settle(fixture);
    const listingsBefore = repo.findAll.mock.calls.length;
    const summariesBefore = repo.summary.mock.calls.length;

    page.delete(makeStat());
    await settle(fixture);

    expect(page.pageIndex()).toBe(1);
    expect(repo.findAll.mock.calls.length).toBe(listingsBefore + 1);
    expect(repo.summary.mock.calls.length).toBeGreaterThan(summariesBefore);
  });

  it('asks the plain confirmation for a stat without a trade', async () => {
    const { page } = await setup({ rows: [makeStat()] });
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');

    page.delete(makeStat());

    expect(ask).toHaveBeenCalledWith('stats.confirmDelete', {
      params: { ticker: 'KTTA', count: 0 },
      variant: 'danger',
    });
  });

  // #635 : the trades stay, unlinked — the warning says so before the stat goes.
  it('warns that the trades of a traded stat stay in the journal, without it', async () => {
    const traded = makeStat({
      trades: [
        { tradeId: 'trade-1', direction: 'SHORT', retainedProfitDollars: -339.1 },
        { tradeId: 'trade-2', direction: 'SHORT', retainedProfitDollars: -444.2 },
      ],
    });
    const { page, repo } = await setup({ rows: [traded] });
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');

    page.delete(traded);

    expect(ask).toHaveBeenCalledWith('stats.confirmDeleteWithTrades', {
      params: { ticker: 'KTTA', count: 2 },
      variant: 'danger',
    });
    expect(repo.delete).toHaveBeenCalledWith('stat-ktta');
  });

  it('never reaches the repository when the confirmation modal is cancelled', async () => {
    const { page, repo } = await setup({ rows: [makeStat()], confirmed: false });

    page.delete(makeStat());

    expect(repo.delete).not.toHaveBeenCalled();
  });

  // ---- Stat → trade (#193) ----

  it('« → Trade » creates the trade and lands on its page', async () => {
    // The whole point of the action is to go and type the executions, so the navigation is part of
    // the contract, not a nicety.
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await settle(fixture);

    page.promoteToTrade(makeStat());

    expect(repo.promoteToTrade).toHaveBeenCalledWith('stat-ktta');
    expect(navigate).toHaveBeenCalledWith(['/journal', 'trade-1']);
  });

  it('a cancelled confirmation creates nothing', async () => {
    const { page, repo } = await setup({ rows: [makeStat()], confirmed: false });

    page.promoteToTrade(makeStat());

    expect(repo.promoteToTrade).not.toHaveBeenCalled();
  });

  it('a traded stat shows one tag per trade and « + » for the next one', async () => {
    // KTTA, 17/09 : a GUS short and, later, a second trade on the same stat (#500).
    const traded = makeStat({
      trades: [
        { tradeId: 'trade-7', direction: 'SHORT', retainedProfitDollars: 291.35 },
        { tradeId: 'trade-8', direction: 'SHORT', retainedProfitDollars: -64 },
      ],
    });
    const { fixture } = await setup({ rows: [traded] });
    await settle(fixture);

    expect(fixture.nativeElement.querySelectorAll('.trade-link')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.trade-links button')).not.toBeNull();
  });

  it('« + » on a traded stat asks for another trade, not the first one', async () => {
    const traded = makeStat({
      trades: [{ tradeId: 'trade-7', direction: 'SHORT', retainedProfitDollars: 291.35 }],
    });
    const { page, repo } = await setup({ rows: [traded] });
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    page.promoteToTrade(traded);

    expect(ask).toHaveBeenCalledWith('stats.confirmAnotherTrade', { params: { ticker: 'KTTA' } });
    expect(repo.promoteToTrade).toHaveBeenCalledWith('stat-ktta');
  });

  // ---- Same ticker, another pattern (#507) ----

  // #648 : a stat is a GUS or a DT — the other pattern is the only one to give birth to.
  it('opening a GUS offers its DT while the day has none', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    page.open(makeStat());
    await settle(fixture);

    expect(repo.freePatterns).toHaveBeenCalledWith('stat-ktta');
    expect(page.siblingPattern()).toBe('DT');
    expect(fixture.nativeElement.querySelector('.premarket-form__sibling')).not.toBeNull();
  });

  it('a day whose patterns are all taken shows no « another pattern » action', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.freePatterns.mockReturnValue(of([]));
    page.open(makeStat());
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.premarket-form__sibling')).toBeNull();
  });

  it('creates the DT of the day once confirmed, opens it in the panel and in the DT view', async () => {
    // SGBX of the mockup : a GUS in the morning, the double top it formed late in the morning.
    const { page, repo, toastShown } = await setup({ rows: [makeStat()] });
    page.setView('GUS');
    page.open(makeStat());

    page.createSibling();

    expect(repo.createSibling).toHaveBeenCalledWith('stat-ktta', 'DT');
    expect(toastShown).toHaveBeenCalledWith('success', 'stats.snackbar.siblingSuccess');
    expect(page.completing()?.id).toBe('stat-sibling');
    expect(page.completing()?.pattern).toBe('DT');
    expect(page.view()).toBe('DT');
  });

  it('a cancelled confirmation creates no stat', async () => {
    const { page, repo } = await setup({ rows: [makeStat()], confirmed: false });
    page.open(makeStat());

    page.createSibling();

    expect(repo.createSibling).not.toHaveBeenCalled();
    expect(page.completing()?.id).toBe('stat-ktta');
  });

  it('a session stat missing its push says so on its disabled tick, in the row and the panel', async () => {
    // Recette #517 : a stat whose row looks full but stops at 4 / 5 must say what is missing.
    const stat = makeStat({ pushOpenPrice: null, completed: false });
    const { page } = await setup({ rows: [stat] });
    page.open(stat);

    expect(page.rowBlockedReason(page.rows()[0])).toBe('stats.completion.missing');
    expect(page.tickBlockedReason()).toBe('stats.completion.missing');
  });

  it('a pattern taken in the meantime says so instead of a generic error', async () => {
    const { page, repo, toastShown } = await setup({ rows: [makeStat()] });
    repo.createSibling.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    page.open(makeStat());

    page.createSibling();

    expect(toastShown).toHaveBeenCalledWith('error', 'stats.snackbar.siblingConflict');
  });

  // ---- Filters ----

  it('a custom period range filters the listing and the KPIs', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    const from = new Date(2026, 8, 14);
    const to = new Date(2026, 8, 18);

    page.setPeriod({ period: 'custom', dateFrom: from, dateTo: to });
    await settle(fixture); // the fetch effect re-runs on change detection

    expect(repo.lastFilter?.dateFrom).toEqual(from);
    expect(repo.lastFilter?.dateTo).toEqual(to);
    expect(repo.summary.mock.calls.at(-1)?.[0]).toEqual(repo.lastFilter);
  });

  it('changing the status filter refetches from page 0 with that status', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    page.pageIndex.set(2);

    page.setStatus('TO_COMPLETE');
    await settle(fixture);

    expect(page.pageIndex()).toBe(0);
    expect(repo.lastFilter?.status).toBe('TO_COMPLETE');
  });

  // #337 : « Complete » on the Today page lands on the stats still to complete.
  it('opens on the tab named in the URL', async () => {
    const { page, repo } = await setup({ query: { status: 'TO_COMPLETE' } });

    expect(page.status()).toBe('TO_COMPLETE');
    expect(repo.lastFilter?.status).toBe('TO_COMPLETE');
  });

  it('falls back to every stat on a tab the URL names wrong', async () => {
    const { page } = await setup({ query: { status: 'SOMEDAY' } });

    expect(page.status()).toBeNull();
  });

  it('follows the URL when it changes under the same page', async () => {
    const { fixture, page, query } = await setup({ query: { status: 'TO_COMPLETE' } });

    query.next(convertToParamMap({ status: 'COMPLETED' }));
    await settle(fixture);

    expect(page.status()).toBe('COMPLETED');
  });

  // #542 : the first load showed a spinner, then the table jumped in.
  it('shows the table skeleton on a slow first load, then the rows once they land', async () => {
    vi.useFakeTimers();
    const firstAnswer = new Subject<PagedResult<StatEntry>>();
    const { fixture } = await setup({ firstAnswer });
    const el: HTMLElement = fixture.nativeElement;

    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(el.querySelector('ui-skeleton-table')).not.toBeNull();

    firstAnswer.next({
      content: [makeStat()],
      pageIndex: 0,
      pageSize: 25,
      totalElements: 1,
      totalPages: 1,
    });
    firstAnswer.complete();
    // The resource takes the answer a microtask later — flushed along with the timers.
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(el.querySelector('ui-skeleton-table')).toBeNull();
    expect(el.querySelector('.stb-table')).not.toBeNull();
    vi.useRealTimers();
  });

  // #370 : the table was unmounted for the length of every refetch, which read as a page reload.
  it('keeps the rows on screen, dimmed, while a filter change refetches', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.findAll.mockReturnValue(new Subject<PagedResult<StatEntry>>());

    page.setStatus('COMPLETED');
    fixture.detectChanges();

    const table: HTMLElement | null = fixture.nativeElement.querySelector('.stb-table');
    expect(table?.classList).toContain('stb-table--busy');
    expect(fixture.nativeElement.querySelector('ui-skeleton-table')).toBeNull();
    expect(page.rows().map((r) => r.ticker)).toEqual(['KTTA']);
  });

  // A load in flight when a write lands answers with pre-write data : the write must supersede it.
  it('a tick during a load refetches, rather than letting the older load win', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.findAll.mockReturnValue(new Subject<PagedResult<StatEntry>>());
    page.setStatus('COMPLETED');
    fixture.detectChanges();
    const callsBefore = repo.findAll.mock.calls.length;

    page.toggleCompleted(makeStat());
    fixture.detectChanges();

    expect(repo.setCompleted).toHaveBeenCalledWith('stat-ktta', false);
    expect(repo.findAll.mock.calls.length).toBe(callsBefore + 1);
  });

  // #667 review : the GET in flight may predate the save — the row would keep the old value while
  // the panel shows the new one.
  it('a field saved during a load asks the page again, rather than trusting the older load', async () => {
    const { fixture, page, repo } = await setup({ rows: [makePending()] });
    repo.findAll.mockReturnValue(new Subject<PagedResult<StatEntry>>());
    page.setStatus('TO_COMPLETE');
    fixture.detectChanges();
    const callsBefore = repo.findAll.mock.calls.length;

    page.toggleFlag('ssr', true);
    fixture.detectChanges();

    expect(repo.update).toHaveBeenCalledWith('stat-sgbx', expect.objectContaining({ ssr: true }));
    // Once, after the save : the optimistic patch before it reloads nothing (#375 review).
    expect(repo.findAll.mock.calls.length).toBe(callsBefore + 1);
    expect(page.completing()?.ssr).toBe(true);
  });

  it('drops the answer of a filter changed again before it arrived', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
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
    await settle(fixture);

    expect(page.rows().map((r) => r.ticker)).toEqual(['BNRG']);
  });

  // ---- GUS sequence (#713) ----

  /** KTTA in the panel, its session typed, the drop still to come. */
  const kttaInProgress = () =>
    makePending({ openPrice: 4.2, pushOpenPrice: 4.62, hodPrice: 4.62, lodPrice: 3.41 });

  // Optional like the DT's : the history has none, the ✓ must not wait for it.
  it("reads the GUS drop live as the short's gain, and counts it apart from the five prices", async () => {
    const { page } = await setup({ rows: [kttaInProgress()] });

    expect(page.gusDropDone()).toBe(false);
    page.setSessionTime('pushOpenTime', '09:41');
    page.setSessionPrice('gusDropPrice', 3.41);
    page.setSessionTime('gusDropTime', '10:25');

    expect(page.gusDropDone()).toBe(true);
    expect(page.gusSequence().drop).toBeCloseTo(-26.19, 2);
    expect(page.gusSequence().pushMinutes).toBe(11);
    expect(page.gusSequence().dropMinutes).toBe(44);
    expect(page.sessionMissing()).toEqual(['stats.fields.eod']);
  });

  it('refuses a drop before the push in time, half typed, or without the push time', async () => {
    const { page, repo } = await setup({ rows: [kttaInProgress()] });
    page.setSessionTime('pushOpenTime', '09:41');

    page.setSessionPrice('gusDropPrice', 3.41);
    page.saveSession();
    expect(repo.update).not.toHaveBeenCalled();
    expect(page.sessionIssue()?.reason).toBe('stats.save.gusDropTimeRequired');
    expect(page.atFault('gusDropTime')).toBe(true);

    page.setSessionTime('gusDropTime', '09:35');
    expect(page.sessionIssue()?.reason).toBe('stats.save.gusDropBeforePush');

    page.setSessionTime('gusDropTime', '10:25');
    page.setSessionTime('pushOpenTime', '');
    expect(page.sessionIssue()?.reason).toBe('stats.save.gusPushTimeRequired');
    expect(page.atFault('pushOpenTime')).toBe(true);
    expect(page.gusDropDone()).toBe(false);
  });

  // #729 : watched to the close, the stock kept rising after the push — the Sink is real, above it,
  // and reads as a loss for the short rather than staying empty.
  it('accepts a Sink above the Push and reads it as a loss for the short', async () => {
    const { page } = await setup({ rows: [kttaInProgress()] });

    page.setSessionTime('pushOpenTime', '09:41');
    page.setSessionPrice('hodPrice', 5);
    page.setSessionPrice('gusDropPrice', 4.7);
    page.setSessionTime('gusDropTime', '15:55');

    expect(page.sessionIssue()).toBeNull();
    expect(page.gusDropDone()).toBe(true);
    expect(page.gusSequence().drop).toBeCloseTo(1.73, 2);
  });

  // GLND, 21/09 : no push — the drop is read against the open, above it on a day that rallied.
  it('reads the drop of a no-push day against the open', async () => {
    const { page } = await setup({
      rows: [makePending({ openPrice: 3.1, hodPrice: 3.2, lodPrice: 2.41, noPush: true })],
    });

    page.setSessionPrice('gusDropPrice', 3.15);
    page.setSessionTime('gusDropTime', '10:58');

    expect(page.sessionIssue()).toBeNull();
    expect(page.gusSequence().drop).toBeCloseTo(1.61, 2);
  });

  // Review of #713 : over the whole history every completed GUS lacks it — an all-amber column.
  it('asks for the drop on a completed GUS that has none, once a period is chosen', async () => {
    const { page } = await setup({
      rows: [
        makeStat({ id: 'ktta' }),
        makeStat({ id: 'bnzi', gusDropPrice: 2.7, gusDropTime: '10:05' }),
        kttaInProgress(),
      ],
    });

    expect(page.rows().map((r) => r.gusDropToFill)).toEqual([false, false, false]);

    page.setPeriod({
      period: 'custom',
      dateFrom: new Date(2026, 8, 14),
      dateTo: new Date(2026, 8, 18),
    });

    expect(page.rows().map((r) => r.gusDropToFill)).toEqual([true, false, false]);
  });

  it("shows what the GUS paid as the short's gain, never as a red fall", async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.summary.mockReturnValue(
      of(
        makeSummary({
          completed: 12,
          sessionsWithDrop: 9,
          medianGusDropPercent: -20,
          gusDropReachedTargetCount: 6,
          sessionsWithPushTime: 10,
          medianPushMinutes: 9.5,
          medianGusDropMinutes: 47,
        }),
      ),
    );
    // A new filter fetches the summary again, with the answer above.
    page.setStatus('COMPLETED');
    await settle(fixture);
    await fixture.whenStable();
    await settle(fixture);

    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="gus-drop-kpis"] .kpi__value',
      ),
    );
    expect(values.map((v) => v.textContent?.trim())).toEqual([
      '+20.0 %',
      '6 / 9',
      'stats.kpi.minutes',
      'stats.kpi.minutes',
    ]);
    expect(values[0].classList).toContain('gain');
  });

  // #713 : both cards read one row per point — the fields named for screen readers and the e2e.
  it('lays the GUS card out one row per point, its fields named', async () => {
    const { fixture } = await setup({ rows: [kttaInProgress()] });
    await fixture.whenStable();
    await settle(fixture);

    const card = (fixture.nativeElement as HTMLElement).querySelector('table.point-rows');
    const labels = Array.from(card?.querySelectorAll('input:not([type=checkbox])') ?? []).map((i) =>
      i.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'stats.fields.openPrice',
      'stats.fields.pushOpenTime',
      'stats.fields.pushOpen',
      'stats.fields.gusDropTime',
      'stats.fields.gusDropPrice',
      'stats.fields.hod',
      'stats.fields.lod',
      'stats.fields.eod',
    ]);
  });

  // ---- No push (#302) ----

  // GLND, 2026-09-21 : dropped straight from the open, only came back up around 11 am.
  it('« No push » empties the push, saves it and counts four prices', async () => {
    const { page, repo } = await setup({ rows: [makePending({ ticker: 'GLND' })] });
    page.setSessionPrice('pushOpenPrice', 3.3);

    page.toggleNoPush(true);

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ noPush: true, pushOpenPrice: null }),
    );
    expect(page.sessionPriceCount()).toBe(4);
    expect(page.sessionMissing()).not.toContain('stats.fields.pushOpen');
  });

  it('unticking « No push » gives back the push typed before', async () => {
    const { page } = await setup({ rows: [makePending()] });
    page.setSessionPrice('pushOpenPrice', 3.3);

    page.toggleNoPush(true);
    page.toggleNoPush(false);

    expect(page.session().pushOpenPrice).toBe(3.3);
    expect(page.sessionPriceCount()).toBe(5);
  });

  // #713 : the push's time goes with it, and comes back with it.
  it('« No push » empties the push time too, and gives it back', async () => {
    const { page } = await setup({ rows: [makePending()] });
    page.setSessionPrice('pushOpenPrice', 3.3);
    page.setSessionTime('pushOpenTime', '09:41');

    page.toggleNoPush(true);
    expect(page.session().pushOpenTime).toBeNull();

    page.toggleNoPush(false);
    expect(page.session().pushOpenTime).toBe('09:41');
  });

  it('a no-push stat can be ticked without a push price', async () => {
    const glnd = makeStat({ noPush: true, pushOpenPrice: null, completed: false });
    const { page } = await setup({ rows: [glnd] });

    expect(page.rows()[0].missing).toEqual([]);
  });

  it('the « No push » tab filters on the no-push days, whatever their status', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });

    page.setStatus('NO_PUSH');
    await settle(fixture);

    expect(repo.lastFilter?.noPush).toBe(true);
    expect(repo.lastFilter?.status).toBeNull();
  });

  // #499 : a tab could not be combined — the flagged stats are worth reading among the completed.
  it('the « Out of pattern » toggle combines with the status tab and rewinds to page 0', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    page.pageIndex.set(2);

    page.setStatus('COMPLETED');
    page.setDerived(['OUT_OF_PATTERN']);
    await settle(fixture);

    expect(page.pageIndex()).toBe(0);
    expect(repo.lastFilter?.status).toBe('COMPLETED');
    expect(repo.lastFilter?.outOfPattern).toBe(true);
    expect(repo.summary.mock.calls.at(-1)?.[0]).toEqual(repo.lastFilter);

    page.setDerived([]);
    await settle(fixture);
    expect(repo.lastFilter?.outOfPattern).toBeNull();
  });

  it('opens with the toggles named by ?derived=, the way the tab follows ?status=', async () => {
    const { page, repo } = await setup({
      rows: [makeStat()],
      query: { status: 'COMPLETED', derived: 'OUT_OF_PATTERN,UNKNOWN' },
    });

    expect(page.derived()).toEqual(['OUT_OF_PATTERN']);
    expect(repo.lastFilter?.outOfPattern).toBe(true);
    expect(repo.lastFilter?.status).toBe('COMPLETED');
  });

  it('the « Under $1 » toggle combines with « Out of pattern », and comes from ?derived= too', async () => {
    const { page, repo } = await setup({
      rows: [makeStat()],
      query: { derived: 'UNDER_1_DOLLAR' },
    });
    expect(repo.lastFilter?.under1Dollar).toBe(true);
    expect(repo.lastFilter?.outOfPattern).toBeNull();

    page.setDerived(['OUT_OF_PATTERN', 'UNDER_1_DOLLAR']);
    TestBed.tick();

    expect(repo.lastFilter?.under1Dollar).toBe(true);
    expect(repo.lastFilter?.outOfPattern).toBe(true);
  });

  it('tags a stat out of pattern, with what the recorded prices say', async () => {
    const { fixture } = await setup({
      rows: [
        makeStat(),
        makeStat({ id: 'stat-imnn', ticker: 'IMNN', outOfPattern: ['PRICE_OUT_OF_RANGE'] }),
      ],
    });
    await fixture.whenStable();
    await settle(fixture);

    const tags = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="out-of-pattern"]',
    );
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toContain('stats.outOfPattern.tag');
  });

  // #334 : on this tab the average push read « — » over « 0 that pushed ».
  it('the « No push » tab rates the no-push days over every completed stat of the period', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.summary.mockImplementation((filter?: StatEntryFilter) =>
      of(
        filter?.noPush
          ? makeSummary({ completed: 1, noPushCount: 1 })
          : makeSummary({ completed: 11, noPushCount: 1 }),
      ),
    );

    page.setStatus('NO_PUSH');
    await settle(fixture);

    expect(repo.summary).toHaveBeenLastCalledWith(expect.objectContaining({ noPush: null }));
    expect(page.noPushRate()?.count).toBe(1);
    expect(page.noPushRate()?.total).toBe(11);
    expect(page.noPushRate()?.share).toBeCloseTo(9.09, 2);
    expect(fixture.nativeElement.textContent).toContain('stats.kpi.noPushDays');
  });

  // A search for SGBX made it « 1 / 1 · 100 % of the period » : one ticker over itself.
  it('rates the no-push days over the period whatever the search box holds', async () => {
    vi.useFakeTimers();
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    page.setStatus('NO_PUSH');
    page.onSearchInput('SGBX');
    vi.advanceTimersByTime(250); // the search box is debounced
    await settle(fixture);
    vi.useRealTimers();

    expect(repo.lastFilter?.query).toBe('SGBX');
    expect(repo.summary).toHaveBeenLastCalledWith(
      expect.objectContaining({ noPush: null, query: null }),
    );
  });

  it('forgets the rate once the tab is left, so it never comes back stale', async () => {
    const { fixture, page } = await setup({ rows: [makeStat()] });
    page.setStatus('NO_PUSH');
    await settle(fixture);
    expect(page.noPushRate()).not.toBeNull();

    page.setStatus(null);
    await settle(fixture);

    expect(page.noPushRate()).toBeNull();
  });

  it('shows a dash rather than « 0 / 0 » on a period with no completed stat', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.summary.mockReturnValue(of(makeSummary({ completed: 0, noPushCount: 0 })));

    page.setStatus('NO_PUSH');
    await settle(fixture);

    expect(page.noPushRate()?.share).toBeNull();
    expect(fixture.nativeElement.querySelector('.kpi__value[aria-busy]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('0 / 0');
  });

  it('the other tabs keep the average push and fetch no period summary', async () => {
    const { repo, page } = await setup({ rows: [makeStat()] });

    expect(repo.summary).toHaveBeenCalledTimes(1);
    expect(page.noPushRate()).toBeNull();
  });

  // ---- Premarket card (#326) ----

  it('saves a premarket fix with the whole row and marks the premarket card saved', async () => {
    const { page, repo } = await setup({ rows: [makePending()] });

    page.setPremarketPrice('pmHigh', 4.8);
    page.saveSession('premarket');

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ pmHigh: 4.8, ticker: 'SGBX' }),
    );
    expect(page.saveStates().premarket.status).toBe('saved');
  });

  it('refuses a PM high under the PM open without sending anything', async () => {
    const { page, repo } = await setup({ rows: [makePending()] });

    page.setPremarketPrice('pmHigh', 1.0);
    page.saveSession('premarket');

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.saveStates().premarket).toEqual(
      expect.objectContaining({ status: 'error', reason: 'stats.save.pmHighBelowPmOpen' }),
    );
  });

  // ---- An emptied premarket price (#340) ----

  // Clearing a price to retype it : the field and the card both say why nothing goes out.
  it('marks an emptied premarket price as required and sends nothing', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta] });
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
  it('holds a session edit while the premarket is incomplete, and says so', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta] });
    page.open(ktta);
    page.setPremarketPrice('previousClose', null);

    page.setSessionPrice('eodPrice', 3.6);
    page.saveSession('session');

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.saveStates().session).toEqual(
      expect.objectContaining({ status: 'error', reason: 'stats.save.waitingPremarket' }),
    );
  });

  it('closes on « leave without saving », the row keeping its saved premarket', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta] });
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
  it('holds a premarket edit while the HOD is below the LOD, and says so', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta] });
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
  it('asks before closing on a HOD below the LOD, and stays open when cancelled', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta], confirmed: false });
    page.open(ktta);
    page.setSessionPrice('hodPrice', 3.2);
    page.setSessionPrice('eodPrice', 3.6);

    page.close();

    expect(page.completing()?.id).toBe(ktta.id);
    expect(page.session().eodPrice).toBe(3.6);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('closes without asking once every edit is saved', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta], confirmed: false });
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
  it('releases the session card once the premarket it was waiting for is saved', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta] });
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

  it('leaves a card blocked on a reason of its own alone', async () => {
    const ktta = makeStat();
    const { page } = await setup({ rows: [ktta] });
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
  it('says « yesterday » on a stat last saved the day before', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 25);
    const nukk = makeStat({ ticker: 'NUKK', updatedAt: yesterday });
    const { page } = await setup({ rows: [nukk] });
    page.open(nukk);

    expect(page.saveLabel(page.saveStates().premarket)).toBe('stats.save.savedYesterdayAt');
    expect(page.saveLabel(page.saveStates().session)).toBe('stats.save.savedYesterdayAt');
  });

  it('gives the date on a stat last saved before yesterday, the time alone today', async () => {
    const { page } = await setup({ rows: [] });

    expect(
      page.saveLabel({ status: 'saved', at: new Date(2026, 7, 10, 18, 5), reason: null }),
    ).toBe('stats.save.savedOnAt');
    expect(page.saveLabel({ status: 'saved', at: new Date(), reason: null })).toBe(
      'stats.save.savedAt',
    );
  });

  it('stays open with the pending edits when leaving is cancelled', async () => {
    const ktta = makeStat();
    const { page, repo } = await setup({ rows: [ktta], confirmed: false });
    page.open(ktta);
    page.setPremarketPrice('previousClose', null);
    page.setPremarketPrice('floatMillions', 6.0);

    page.close();

    expect(page.completing()?.id).toBe(ktta.id);
    expect(page.premarket().floatMillions).toBe(6.0);
    expect(repo.update).not.toHaveBeenCalled();
  });

  // ---- Views (#437) ----

  it('opens on the GUS view : the listing and the KPIs read the GUS stats, with their columns', async () => {
    const { page, repo } = await setup({ rows: [makeStat()] });

    expect(page.view()).toBe('GUS');
    expect(repo.lastFilter?.pattern).toBe('GUS');
    expect(repo.summary.mock.calls.at(-1)?.[0]).toEqual(repo.lastFilter);
    expect(page.columns()).toContain('pushOpen');
    expect(page.columns()).not.toContain('dtTop');
  });

  // #821 : they sat past every figure, a sideways scroll away.
  it('keeps what acts on a row right after the date, the ticker and the pattern, in every view', async () => {
    const { page } = await setup();

    for (const view of ['GUS', 'DT', 'ALL'] as const) {
      page.setView(view);

      expect(page.columns().slice(0, 6)).toEqual([
        'tradeDate',
        'ticker',
        'pattern',
        'completed',
        'trade',
        'actions',
      ]);
      expect(page.columns().at(-1)).toBe('flags');
    }
  });

  it('keeps the bottom row under its columns, in the views that have one', async () => {
    const { fixture, page } = await setup({ rows: [makeStat()] });

    for (const [view, firstFigure] of [
      ['GUS', 'hold'],
      ['DT', 'dtTop'],
    ] as const) {
      page.setView(view);
      await settle(fixture);
      await fixture.whenStable();

      const cells = [
        ...fixture.nativeElement.querySelectorAll('tr.averages-row td'),
      ] as HTMLTableCellElement[];
      expect(cells[0].colSpan).toBe(page.columns().indexOf(firstFigure));
      expect(cells.reduce((sum, cell) => sum + cell.colSpan, 0)).toBe(page.columns().length);
    }
  });

  // #499 : one or two big movers dragged the averages by up to 7 points.
  it('the GUS view shows a hold column next to the open and a medians row', async () => {
    const { fixture, page } = await setup({ rows: [makeStat()] });
    await fixture.whenStable();
    await settle(fixture);
    const columns = page.columns();

    expect(columns.indexOf('hold')).toBe(columns.indexOf('openPrice') + 1);
    expect(page.footerColumns()).toEqual(
      expect.arrayContaining(['sessionMediansLabel', 'hold', 'pushOpen', 'lod', 'eod']),
    );
    expect(fixture.nativeElement.querySelector('tr.averages-row')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('stats.complete.medians');
  });

  it('shows the cumulative under the gap on the GUS view only, never on the DT one', async () => {
    const { fixture, page } = await setup({ rows: [makeStat()] });
    const gapNote = (): Element | null =>
      fixture.nativeElement.querySelector('td.mat-column-gap .leg-note');
    await fixture.whenStable();
    await settle(fixture);

    expect(gapNote()?.textContent).toContain('stats.fields.cumulativePmHigh');

    page.setView('DT');
    await settle(fixture);
    await fixture.whenStable();
    await settle(fixture);

    expect(gapNote()).toBeNull();
  });

  it('reads the median hold card off the summary', async () => {
    const { fixture } = await setup({ rows: [makeStat()] });
    await fixture.whenStable();
    await settle(fixture);

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.kpi'),
      (tile) => tile.querySelector('.kpi__label')?.textContent?.trim(),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        'stats.kpi.medianPushOpen',
        'stats.kpi.medianLod',
        'stats.kpi.medianHold',
      ]),
    );
    expect(fixture.nativeElement.textContent).toContain('-17.3 %');
  });

  it('the DT view reads the double tops, shows their legs and their averages row', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeDoubleTop({ dtRetestPrice: 2.85 })] });

    page.setView('DT');
    await settle(fixture);
    await fixture.whenStable();

    expect(repo.lastFilter?.pattern).toBe('DT');
    expect(page.columns()).toEqual(
      expect.arrayContaining(['dtStart', 'dtTop', 'dtLow', 'dtRetest', 'dtDuration']),
    );
    expect(page.columns()).not.toContain('pushOpen');
    // #649 : no premarket on a double top — float and volume stay.
    expect(page.columns()).not.toContain('gap');
    expect(page.columns()).not.toContain('pmPush');
    expect(page.columns()).toEqual(expect.arrayContaining(['float', 'volume']));
    expect(fixture.nativeElement.querySelector('tr.averages-row')).not.toBeNull();
    expect(page.statusTabs()).not.toContain('NO_PUSH');
  });

  // #469 : the question behind the times — does a double top really take half an hour ?
  it('shows the median duration of the double tops in the DT view, a dash without any', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeDoubleTop()] });
    const tileValue = () =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="dt-median-duration"] .kpi__value')
        ?.textContent?.trim();

    repo.summary.mockReturnValue(
      of(
        makeSummary({
          completedDoubleTops: 3,
          medianDoubleTopMinutes: 34,
          medianRejectionMinutes: 7,
        }),
      ),
    );
    page.setView('DT');
    await settle(fixture);
    await fixture.whenStable();
    await settle(fixture);
    expect(tileValue()).toBe('stats.kpi.minutes');

    repo.summary.mockReturnValue(of(makeSummary({ medianDoubleTopMinutes: null })));
    page.setView('GUS');
    page.setView('DT');
    await settle(fixture);
    await fixture.whenStable();
    await settle(fixture);
    expect(tileValue()).toBe('—');
  });

  it('« All » reads every pattern, sums each stat up in its own and has no averages row', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat(), makeDoubleTop()] });

    page.setView('ALL');
    await settle(fixture);
    await fixture.whenStable();

    expect(repo.lastFilter?.pattern).toBeNull();
    expect(page.columns()).toContain('brief');
    expect(page.columns()).not.toContain('pushOpen');
    expect(page.columns()).not.toContain('dtTop');
    expect(fixture.nativeElement.querySelector('tr.averages-row')).toBeNull();
  });

  // #706 recette : the D leg read « -3,3 %  · D+20,7 % » — Angular dropped the blank between its two
  // spans and kept the one on each side of the separator.
  it('spaces the S leg of the brief like A, R and E', async () => {
    const { fixture, page } = await setup({
      rows: [
        makeDoubleTop({
          dtRetestPrice: 2.85,
          dtRetestTime: '10:38',
          dtDropPrice: 2.3,
          dtDropTime: '11:03',
        }),
      ],
    });

    page.setView('ALL');
    await settle(fixture);
    await fixture.whenStable();

    const brief = (fixture.nativeElement as HTMLElement).querySelector('td.brief')?.textContent;
    expect(brief?.trim()).toMatch(/briefToTop · S \+19\.3 %$/);
  });

  // #452 : with no column, the footer row still laid out a blank 52 px band under the table.
  it('collapses the empty footer row on « All » only', async () => {
    const { fixture, page } = await setup({ rows: [makeStat()] });
    const footer = (): Element | null =>
      fixture.nativeElement.querySelector('tr.mat-mdc-footer-row');

    expect(footer()?.classList).not.toContain('no-averages');

    page.setView('ALL');
    await settle(fixture);
    await fixture.whenStable();

    expect(footer()?.classList).toContain('no-averages');
  });

  it('ambers the extension of a double top under the criterion', async () => {
    // From 1,90 to 2,50 : +31,6 % from the start, under the 50 % criterion.
    const { fixture, page } = await setup({ rows: [makeDoubleTop({ dtTopPrice: 2.5 })] });
    TestBed.inject(TranslateService).setTranslation('en', {
      stats: { doubleTop: { cellA: '{{leg}} %' } },
    });

    page.setView('DT');
    await settle(fixture);
    await fixture.whenStable();

    const note: HTMLElement = fixture.nativeElement.querySelector('td.mat-column-dtTop .leg-note');
    expect(note.classList).toContain('warn');
    expect(note.textContent).toContain('31.6');
  });

  it('leaving the GUS view drops the « No push » tab it was on', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    page.setStatus('NO_PUSH');

    page.setView('DT');
    await settle(fixture);

    expect(page.status()).toBeNull();
    expect(repo.lastFilter?.noPush).toBeNull();
  });

  // A double top left to complete is one of them : the GUS view would hide it.
  it('lands on « All » from a link naming the stats to complete', async () => {
    const { page, repo } = await setup({ query: { status: 'TO_COMPLETE' } });

    expect(page.view()).toBe('ALL');
    expect(repo.lastFilter?.pattern).toBeNull();
  });

  it('moves to the DT view when the URL names a double top, its panel open', async () => {
    const { fixture, page, repo } = await setup({
      rows: [makeStat()],
      query: { stat: 'stat-sgbx-dt' },
      byId: makeDoubleTop(),
    });
    await settle(fixture);

    expect(page.view()).toBe('DT');
    expect(repo.lastFilter?.pattern).toBe('DT');
    expect(page.completing()?.id).toBe('stat-sgbx-dt');
  });

  // ---- Double top card (#437) ----

  it('shows the double top card on a DT stat, its legs computed live', async () => {
    const { page } = await setup({ rows: [makeDoubleTop()] });

    expect(page.completing()?.id).toBe('stat-sgbx-dt');
    expect(page.isDoubleTop()).toBe(true);
    page.setSessionPrice('dtRetestPrice', 2.85);

    // The SGBX of the mockup : A +55.3 %, B −20.0 %, C +20.8 %, −3.4 % off the top.
    const legs = page.doubleTopLegs();
    expect(legs.extension).toBeCloseTo(55.26, 2);
    expect(legs.rejection).toBeCloseTo(-20, 2);
    expect(legs.retest).toBeCloseTo(20.76, 2);
    expect(legs.retestToTop).toBeCloseTo(-3.39, 2);
  });

  it('counts five prices and five times on a double top and names what is missing', async () => {
    const { page } = await setup({ rows: [makeDoubleTop()] });

    expect(page.doubleTopProgress()).toEqual({
      prices: 3,
      times: 3,
      total: 5,
      tookTop: false,
      dropAsked: true,
      notRead: false,
    });
    const missing = [
      'stats.fields.dtRetest',
      'stats.fields.dtDrop',
      'stats.fields.dtRetestTimeShort',
      'stats.fields.dtDropTimeShort',
    ];
    expect(page.sessionMissing()).toEqual(missing);
    expect(page.rows()[0].missing).toEqual(missing);
  });

  // #469 : the price alone no longer ticks a double top — its time is required like it.
  it('keeps the tick blocked on a double top with its five prices but a time missing', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtDropPrice: 2.3, dtDropTime: '11:03' })],
    });

    expect(page.sessionMissing()).toEqual(['stats.fields.dtRetestTimeShort']);
    expect(page.tickBlockedReason()).not.toBe('');
  });

  // SGBX of the mockup : 10:02, 10:14, 10:21, 10:38.
  it('reads how long each leg took, live, as the times are typed', async () => {
    const { page } = await setup({ rows: [makeDoubleTop()] });

    expect(page.doubleTopDurations()).toEqual({
      rise: 12,
      rejection: 7,
      retest: null,
      total: null,
      drop: null,
    });
    page.setSessionTime('dtRetestTime', '10:38');

    expect(page.doubleTopDurations()).toEqual({
      rise: 12,
      rejection: 7,
      retest: 17,
      total: 36,
      drop: null,
    });
    expect(page.rows()[0].durations.rise).toBe(12);
  });

  // #710 : the drop is the fifth point, required once the history has it — under the top, there
  // was one to record.
  it('waits for the drop before ticking a double top whose retest stayed under the top', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtRetestTime: '10:38' })],
    });

    expect(page.tickBlockedReason()).not.toBe('');
    expect(page.doubleTopProgress()).toEqual({
      prices: 4,
      times: 4,
      total: 5,
      tookTop: false,
      dropAsked: true,
      notRead: false,
    });

    page.setSessionPrice('dtDropPrice', 2.3);
    page.setSessionTime('dtDropTime', '11:03');

    expect(page.tickBlockedReason()).toBe('');
    expect(page.doubleTopProgress()).toEqual({
      prices: 5,
      times: 5,
      total: 5,
      tookTop: false,
      dropAsked: true,
      notRead: false,
    });
    expect(page.doubleTopLegs().drop).toBeCloseTo(-19.3, 2);
    expect(page.doubleTopDurations().drop).toBe(25);
  });

  // #726 : the September double tops — weeks old, their lows can't be read back, and the app never
  // asked for them then. Complete on four points, by the standard of their day.
  it('ticks a double top recorded before the drop was asked on its four points', async () => {
    const { page } = await setup({
      rows: [
        makeDoubleTop({
          tradeDate: new Date(2026, 8, 17),
          dtRetestPrice: 2.85,
          dtRetestTime: '10:38',
        }),
      ],
    });

    expect(page.doubleTopProgress()).toEqual({
      prices: 4,
      times: 4,
      total: 4,
      tookTop: false,
      dropAsked: false,
      notRead: false,
    });
    expect(page.sessionMissing()).toEqual([]);
    expect(page.rows()[0].missing).toEqual([]);
    expect(page.tickBlockedReason()).toBe('');
  });

  it('asks a new double top for its drop from the day it was first recorded', async () => {
    const { page } = await setup({ rows: [] });
    page.startNew();

    page.setIdentity({ ticker: 'nxtt', tradeDate: new Date(2026, 9, 11), pattern: 'DT' });
    expect(page.sessionPriceCount()).toBe(4);

    page.setIdentity({ ticker: 'nxtt', tradeDate: DT_DROP_DAY, pattern: 'DT' });
    expect(page.sessionPriceCount()).toBe(5);
  });

  // IMNN : the retest took the top back and kept going — a breakout, no drop to measure.
  it('ticks a double top whose retest took the top back on its four points', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 3.0, dtRetestTime: '10:38' })],
    });

    expect(page.doubleTopProgress()).toEqual({
      prices: 4,
      times: 4,
      total: 4,
      tookTop: true,
      dropAsked: true,
      notRead: false,
    });
    expect(page.sessionMissing()).toEqual([]);
    expect(page.tickBlockedReason()).toBe('');
  });

  it('refuses a drop before the retest in time, pointing at its time', async () => {
    const { page, repo } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtRetestTime: '10:38' })],
    });

    page.setSessionPrice('dtDropPrice', 2.3);
    page.setSessionTime('dtDropTime', '10:30');
    page.saveSession();
    expect(repo.update).not.toHaveBeenCalled();
    expect(page.sessionIssue()?.reason).toBe('stats.save.timeOutOfOrder');
    expect(page.atFault('dtDropTime')).toBe(true);
  });

  // #729 : watched to the close, the session rallied off the Echo — the Sink is real, above it, and
  // reads as a loss for the short rather than forcing « not read ».
  it('accepts a Sink above the Echo and reads its leg as a loss for the short', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtRetestTime: '10:38' })],
    });

    page.setSessionPrice('dtDropPrice', 2.9);
    page.setSessionTime('dtDropTime', '15:55');

    expect(page.sessionIssue()).toBeNull();
    expect(page.tickBlockedReason()).toBe('');
    expect(page.doubleTopLegs().drop).toBeCloseTo(1.75, 2);
  });

  // Half a drop counted in the KPI's n but not in its duration : the save waits for the pair.
  it('holds a drop price until its time is typed, pointing at the time', async () => {
    const { page, repo } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtRetestTime: '10:38' })],
    });

    page.setSessionPrice('dtDropPrice', 2.3);
    page.saveSession();
    expect(repo.update).not.toHaveBeenCalled();
    expect(page.sessionIssue()?.reason).toBe('stats.save.dropTimeRequired');
    expect(page.atFault('dtDropTime')).toBe(true);

    page.setSessionTime('dtDropTime', '11:03');
    page.saveSession();
    expect(page.sessionIssue()).toBeNull();
    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx-dt',
      expect.objectContaining({ dtDropPrice: 2.3, dtDropTime: '11:03' }),
    );
  });

  it('holds a drop time typed without its price, pointing at the price', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtRetestTime: '10:38' })],
    });

    page.setSessionTime('dtDropTime', '11:03');

    expect(page.sessionIssue()?.reason).toBe('stats.save.dropPriceRequired');
    expect(page.atFault('dtDropPrice')).toBe(true);
  });

  it("shows what the double tops paid as the short's gain, never as a red fall", async () => {
    const { fixture, page, repo } = await setup({ rows: [makeDoubleTop()] });
    repo.summary.mockReturnValue(
      of(
        makeSummary({
          completedDoubleTops: 3,
          doubleTopsWithDrop: 2,
          medianDropPercent: -17.29,
          medianDropFromEntryPercent: -15.33,
          medianDropMinutes: 39,
          dropReachedTargetCount: 2,
        }),
      ),
    );
    page.setView('DT');
    await settle(fixture);
    await fixture.whenStable();
    await settle(fixture);

    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="dt-drop-kpis"] .kpi__value',
      ),
    );
    expect(values.map((v) => v.textContent?.trim())).toEqual([
      '+17.3 %',
      '+15.3 %',
      'stats.kpi.minutes',
      '2 / 2',
    ]);
    expect(values[0].classList).toContain('gain');
    expect(values[0].classList).not.toContain('loss');
  });

  it('sends nothing while the times go back, and points at the one that does', async () => {
    const { page, repo } = await setup({ rows: [makeDoubleTop()] });

    page.setSessionTime('dtLowTime', '10:10');
    page.saveSession();

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.sessionIssue()?.reason).toBe('stats.save.timeOutOfOrder');
    expect(page.atFault('dtLowTime')).toBe(true);
    expect(page.atFault('dtTopTime')).toBe(true);
    expect(page.atFault('dtStartTime')).toBe(false);
  });

  // #490 : the natural way out of a refusal is to put the stored value back — nothing to send, and
  // the card must stop saying « non enregistré ».
  it('reads saved again when a refused time is typed back to the stored one', async () => {
    const { page, repo } = await setup({ rows: [makeDoubleTop()] });

    page.setSessionTime('dtStartTime', '03:00');
    page.saveSession();
    expect(page.saveStates().session.status).toBe('error');

    page.setSessionTime('dtStartTime', '10:02');
    page.saveSession();

    expect(page.saveStates().session).toEqual(
      expect.objectContaining({ status: 'saved', reason: null }),
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('refuses a time outside the extended session, and takes a premarket one', async () => {
    const { page } = await setup({ rows: [makeDoubleTop()] });

    page.setSessionTime('dtStartTime', '02:10');
    expect(page.sessionIssue()?.reason).toBe('stats.save.timeOutsideSession');
    expect(page.atFault('dtStartTime')).toBe(true);

    page.setSessionTime('dtStartTime', '07:30');
    expect(page.sessionIssue()).toBeNull();
  });

  it('a cleared time goes back to null, not an empty string', async () => {
    const { page } = await setup({ rows: [makeDoubleTop()] });

    page.setSessionTime('dtTopTime', '');

    expect(page.session().dtTopTime).toBeNull();
  });

  it('saves a double top price with the whole row, then ticks it with its five prices and times', async () => {
    const { page, repo } = await setup({
      rows: [makeDoubleTop({ dtDropPrice: 2.3, dtDropTime: '11:03' })],
    });

    page.setSessionPrice('dtRetestPrice', 2.85);
    page.setSessionTime('dtRetestTime', '10:38');
    page.saveSession();

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx-dt',
      expect.objectContaining({
        pattern: 'DT',
        dtStartPrice: 1.9,
        dtRetestPrice: 2.85,
        dtStartTime: '10:02',
        dtRetestTime: '10:38',
      }),
    );
    expect(page.tickBlockedReason()).toBe('');
    page.toggleCompleted(page.completing()!);
    expect(repo.setCompleted).toHaveBeenCalledWith('stat-sgbx-dt', true);
  });

  // #649 : a double top is read off the session — its first card keeps float, volume and note.
  it('asks a double top for no premarket price, and saves it without one', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeDoubleTop()] });
    await fixture.whenStable();
    await settle(fixture);

    const labels = (fixture.nativeElement as HTMLElement).querySelector(
      '.premarket-form',
    )?.textContent;
    expect(labels).not.toContain('stats.fields.previousClose');
    expect(labels).not.toContain('stats.fields.pmOpen');
    expect(labels).toContain('stats.fields.float');
    expect(page.premarketRequired()).toEqual({
      previousClose: false,
      pmOpen: false,
      pmHigh: false,
    });

    page.setPremarketPrice('floatMillions', 4.2);
    page.saveSession('premarket');

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx-dt',
      expect.objectContaining({ previousClose: null, pmOpen: null, floatMillions: 4.2 }),
    );
  });

  it('sends nothing while the double top is out of shape, and names the fields', async () => {
    const { page, repo } = await setup({ rows: [makeDoubleTop()] });

    page.setSessionPrice('dtRetestPrice', 2.3);
    page.saveSession();

    expect(repo.update).not.toHaveBeenCalled();
    expect(page.sessionIssue()?.reason).toBe('stats.save.retestBelowLow');
    expect(page.atFault('dtRetestPrice')).toBe(true);
    expect(page.atFault('dtTopPrice')).toBe(false);
  });

  // #648 : SIR, SIV and discretionary are trades only — no view, no pattern for a new stat.
  it('offers the GUS and DT views and patterns only', async () => {
    const { page } = await setup({ rows: [makePending()] });

    expect(page.views).toEqual(['GUS', 'DT', 'ALL']);
    expect(page.patterns).toEqual(['GUS', 'DT']);
  });

  // The discretionary stat left in production before #648 : still reachable, through « All ».
  it('opens a stat left under another pattern in « All », the only view that lists it', async () => {
    const legacy = makeStat({ id: 'stat-disc', pattern: 'DISCRETIONARY' });
    const { fixture, page } = await setup({ rows: [], query: { stat: 'stat-disc' }, byId: legacy });
    await settle(fixture);

    expect(page.view()).toBe('ALL');
    expect(page.completing()?.id).toBe('stat-disc');
  });

  // ---- New stat (#326) ----

  // GLND, three days back : found on the charts, never captured as a candidate.
  it('creates a stat typed by hand once confirmed, then carries on with it', async () => {
    const { page, repo } = await setup({ rows: [] });
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

  it('says so when the new stat adopts the trades already in the journal on its triple', async () => {
    // #732 : LINK1 shorted twice live, the stat typed after the close — both trades join it.
    const { page, repo, toastShown } = await setup({ rows: [] });
    repo.create.mockReturnValue(
      of(
        makeStat({
          id: 'stat-new',
          ticker: 'LINK1',
          trades: [
            { tradeId: 'trade-1', direction: 'SHORT', retainedProfitDollars: null },
            { tradeId: 'trade-2', direction: 'SHORT', retainedProfitDollars: null },
          ],
        }),
      ),
    );
    page.startNew();
    page.setIdentity({ ticker: 'link1', tradeDate: new Date(2026, 9, 14) });
    page.setPremarketPrice('previousClose', 1.96);
    page.setPremarketPrice('pmOpen', 3.1);
    page.setPremarketPrice('pmHigh', 3.48);

    page.createStat();

    expect(toastShown).toHaveBeenCalledWith('success', 'stats.snackbar.createAttached');
  });

  it('a new stat typed as DT is created with the double top card, then shown in the DT view', async () => {
    const { page, repo } = await setup({ rows: [] });
    page.startNew();

    page.setIdentity({ ticker: 'nxtt', tradeDate: DT_DROP_DAY, pattern: 'DT' });
    expect(page.isDoubleTop()).toBe(true);
    expect(page.sessionPriceCount()).toBe(5);
    // #649 : a double top asks for no premarket — the date and the ticker are enough.
    expect(page.createMissing()).toEqual([]);
    page.setSessionPrice('dtStartPrice', 1.75);
    page.setSessionPrice('dtTopPrice', 2.64);
    page.createStat();

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'NXTT',
        pattern: 'DT',
        previousClose: null,
        pmOpen: null,
        pmHigh: null,
        dtStartPrice: 1.75,
        dtTopPrice: 2.64,
      }),
    );
    expect(page.view()).toBe('DT');
    expect(page.completing()?.pattern).toBe('DT');
  });

  it('never saves a field of a stat not created yet', async () => {
    const { page, repo } = await setup({ rows: [] });
    page.startNew();

    page.setPremarketPrice('previousClose', 1.96);
    page.saveSession('premarket');

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('creates nothing when the confirmation is cancelled', async () => {
    const { page, repo } = await setup({ rows: [], confirmed: false });
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

/**
 * « Sink non relevé » (#729) — which kind of absent. The mark says the figure was not read and will
 * not be : it records the observer, never the market. What is pinned :
 *
 *  - **Ticking it empties the Sink, typing a Sink unticks it** — the two never sit together.
 *  - **A double top ticks on its four points** once marked, and the box only shows where a Sink is
 *    asked : not after a retest that took the top, not before the drop was asked (12/10).
 *  - **The table reads « not read »** instead of the amber « to fill ».
 *  - **The KPI sub-label** splits the stats without a Sink by reason, and the terms add up.
 */
describe('StatsPage — Sink not read (#729)', () => {
  const EN_SUB = {
    stats: {
      kpi: {
        dropSub: 'median · Echo → Sink · n = {{count}} Sinks',
        dropSubTookTop: ', {{count}} of them after the Apex was taken back',
        gusDropSub: "median · Push's top → Sink · n = {{count}} of {{total}} completed GUS",
        withoutDrop: ' · no Sink : {{count}} ({{reasons}})',
        withoutDropReason: {
          tookTop: 'Apex taken back {{count}}',
          notRead: 'not read {{count}}',
          notAsked: 'not asked {{count}}',
          toFill: 'to fill {{count}}',
        },
      },
    },
  };

  it('empties the Sink when ticked and saves the mark', async () => {
    const { page, repo } = await setup({ rows: [makePending({ ticker: 'AEHL' })] });
    page.setSessionPrice('gusDropPrice', 3.15);

    page.toggleDropNotRead(true);

    expect(repo.update).toHaveBeenCalledWith(
      'stat-sgbx',
      expect.objectContaining({ dropNotRead: true, gusDropPrice: null, gusDropTime: null }),
    );
  });

  it('takes the mark off as soon as a Sink is typed', async () => {
    const { page } = await setup({ rows: [makePending({ dropNotRead: true })] });

    page.setSessionPrice('gusDropPrice', 3.15);

    expect(page.session().dropNotRead).toBe(false);
  });

  // MULN, 17/10 : the session was not watched to the end — the low can't be read back.
  it('lets a double top tick on its four points once its Sink is marked as not read', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 2.85, dtRetestTime: '10:38' })],
    });
    expect(page.sessionMissing()).toContain('stats.fields.dtDrop');

    page.toggleDropNotRead(true);

    expect(page.sessionMissing()).toEqual([]);
    expect(page.doubleTopProgress().total).toBe(4);
  });

  it('offers the mark only where a Sink is asked', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ dtRetestPrice: 3.0, dtRetestTime: '10:38' })],
    });

    expect(page.dropMarkable()).toBe(false);
  });

  it('offers no mark on a double top recorded before the Sink was asked', async () => {
    const { page } = await setup({
      rows: [makeDoubleTop({ tradeDate: new Date(2026, 8, 17), dtRetestPrice: 2.85 })],
    });

    expect(page.dropMarkable()).toBe(false);
  });

  it('reads « not read » in the table rather than asking for the Sink', async () => {
    const { page } = await setup({
      rows: [makeStat({ id: 'aehl', dropNotRead: true }), makeStat({ id: 'ktta' })],
    });
    page.setPeriod({
      period: 'custom',
      dateFrom: new Date(2026, 8, 14),
      dateTo: new Date(2026, 8, 18),
    });

    expect(page.rows().map((r) => r.gusDropToFill)).toEqual([false, true]);
  });

  it('splits the double tops without a Sink by reason, the terms adding up', async () => {
    const { page } = await setup();
    TestBed.inject(TranslateService).setTranslation('en', EN_SUB);

    const label = page.dropSubLabel(
      makeSummary({
        completedDoubleTops: 4,
        doubleTopsWithDrop: 2,
        doubleTopsTookTopWithoutDrop: 1,
        doubleTopsDropNotRead: 1,
      }),
      'DT',
    );

    expect(label).toBe(
      'median · Echo → Sink · n = 2 Sinks · no Sink : 2 (Apex taken back 1 · not read 1)',
    );
  });

  // The old « n = 2 · Apex repris : 1 » read as two slices ; an Echo that took the Apex and fell
  // all the same is one of the Sinks.
  it('counts a Sink after a retest that took the top among the Sinks, not beside them', async () => {
    const { page } = await setup();
    TestBed.inject(TranslateService).setTranslation('en', EN_SUB);

    const label = page.dropSubLabel(
      makeSummary({ completedDoubleTops: 3, doubleTopsWithDrop: 3, dropsAfterTookTop: 1 }),
      'DT',
    );

    expect(label).toBe(
      'median · Echo → Sink · n = 3 Sinks, 1 of them after the Apex was taken back',
    );
  });

  it('tells the GUS still to fill from the ones not read', async () => {
    const { page } = await setup();
    TestBed.inject(TranslateService).setTranslation('en', EN_SUB);

    const label = page.dropSubLabel(
      makeSummary({ completed: 12, sessionsWithDrop: 9, sessionsDropNotRead: 1 }),
      'GUS',
    );

    expect(label).toBe(
      "median · Push's top → Sink · n = 9 of 12 completed GUS · no Sink : 3 (to fill 2 · not read 1)",
    );
  });
});

/** NXTP, a GUS the scanner dropped on 09/18 — no candidate, waiting for its review. */
function makeScanned(overrides: Partial<StatEntry> = {}): StatEntry {
  return makeStat({
    id: 'stat-nxtp',
    candidateId: null,
    ticker: 'NXTP',
    completed: false,
    source: 'SCANNER',
    review: 'TO_REVIEW',
    ...overrides,
  });
}

describe('StatsPage — the scanner stats to review (#764)', () => {
  it('tags and tints a stat to review, and blocks its ✓ until it is validated', async () => {
    const { fixture, page } = await setup({ rows: [makeScanned()] });

    const row = fixture.nativeElement.querySelector('tr.to-review');
    expect(row).not.toBeNull();
    expect(row.querySelector('.review-tag--to-review').textContent).toContain(
      'stats.review.tag.TO_REVIEW',
    );
    expect(page.rowBlockedReason(page.rows()[0])).toBe('stats.review.tickBlocked');
  });

  it('never opens a stat to review on its own — it waits for « Relire »', async () => {
    const { page } = await setup({ rows: [makeScanned()] });

    expect(page.completing()).toBeNull();
  });

  it('a stat to review is never ticked, even with its whole session', async () => {
    const { page, repo } = await setup({ rows: [makeScanned()] });

    page.toggleCompleted(makeScanned());

    expect(repo.setCompleted).not.toHaveBeenCalled();
  });

  it('« Valider » needs no confirmation, then reloads the listing and the KPIs', async () => {
    const { fixture, page, repo, toastShown } = await setup({ rows: [makeScanned()] });
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    const listings = repo.findAll.mock.calls.length;
    const summaries = repo.summary.mock.calls.length;

    page.validate(makeScanned());
    await settle(fixture);

    expect(ask).not.toHaveBeenCalled();
    expect(repo.validate).toHaveBeenCalledWith('stat-nxtp');
    expect(repo.findAll.mock.calls.length).toBeGreaterThan(listings);
    expect(repo.summary.mock.calls.length).toBeGreaterThan(summaries);
    expect(toastShown).toHaveBeenCalledWith('success', 'stats.snackbar.validateSuccess');
  });

  it("« Rejeter » asks with the reasons of the stat's pattern and sends the one picked", async () => {
    // BNRG, a double top the Echo broke through.
    const bnrg = makeScanned({ id: 'stat-bnrg', ticker: 'BNRG', pattern: 'DT' });
    const { page, repo } = await setup({
      rows: [bnrg],
      pick: { confirmed: true, value: 'BREAKOUT', note: 'The Echo clears the Apex by 12 %' },
    });
    const choose = vi.spyOn(TestBed.inject(ConfirmService), 'choose');

    page.reject(bnrg);

    expect(choose).toHaveBeenCalledWith(
      'stats.confirmReject',
      REJECTION_REASONS.DT,
      'stats.rejectionReason',
      expect.objectContaining({
        params: { ticker: 'BNRG' },
        variant: 'danger',
        noteMaxLength: REJECTION_NOTE_MAX_LENGTH,
      }),
    );
    expect(repo.reject).toHaveBeenCalledWith(
      'stat-bnrg',
      'BREAKOUT',
      'The Echo clears the Apex by 12 %',
    );
  });

  it('a rejection left without a reason is sent without one', async () => {
    const { page, repo } = await setup({ rows: [makeScanned()] });

    page.reject(makeScanned());

    expect(repo.reject).toHaveBeenCalledWith('stat-nxtp', null, null);
  });

  it('cancelling the rejection never reaches the repository', async () => {
    const { page, repo } = await setup({ rows: [makeScanned()], pick: { confirmed: false } });

    page.reject(makeScanned());

    expect(repo.reject).not.toHaveBeenCalled();
  });

  it('rejecting the stat open in the panel closes it', async () => {
    const { fixture, page } = await setup({ rows: [makeScanned()] });
    page.open(makeScanned());
    await settle(fixture);

    page.reject(makeScanned());

    expect(page.completing()).toBeNull();
  });

  it('« Rétablir » sends a rejected stat back to review', async () => {
    const rejected = makeScanned({ review: 'REJECTED', rejectionReason: 'NEWS' });
    const { page, repo, toastShown } = await setup({ rows: [rejected] });

    page.restore(rejected);

    expect(repo.restore).toHaveBeenCalledWith('stat-nxtp');
    expect(toastShown).toHaveBeenCalledWith('success', 'stats.snackbar.restoreSuccess');
  });

  it('a rejected stat reads its reason, and offers nothing but « Rétablir »', async () => {
    const rejected = makeScanned({ review: 'REJECTED', rejectionReason: 'NEWS' });
    const { fixture, page } = await setup({ rows: [rejected] });

    expect(page.reviewTag(rejected)).toBe('stats.review.tag.REJECTED_BECAUSE');
    const row: HTMLElement = fixture.nativeElement.querySelector('tr.rejected');
    expect(row.querySelector('.tick')).toBeNull();
    expect(row.textContent).toContain('stats.review.restore');
    expect(row.textContent).not.toContain('stats.actions.toTrade');
  });

  it('« À relire » asks for the stats to review on « All », and shows their count', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });
    repo.countToReview.mockReturnValue(of(4));

    page.setStatus('TO_REVIEW');
    await settle(fixture);

    expect(page.view()).toBe('ALL');
    expect(repo.lastFilter).toEqual(
      expect.objectContaining({ review: 'TO_REVIEW', status: null, pattern: null }),
    );
    expect(page.reviewCount()).toBe(4);
  });

  it('the count of « À relire » reads every pattern, whatever the view', async () => {
    const { repo } = await setup({ rows: [makeStat()] });

    expect(repo.countToReview).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ pattern: 'GUS' }),
    );
  });

  it('a link to the stats to review lands on « All », the tab selected', async () => {
    const { page, repo } = await setup({ query: { status: 'TO_REVIEW' } });

    expect(page.view()).toBe('ALL');
    expect(page.status()).toBe('TO_REVIEW');
    expect(repo.lastFilter?.review).toBe('TO_REVIEW');
  });

  it('« Rejetées » adds the rejected stats to the listing', async () => {
    const { fixture, page, repo } = await setup({ rows: [makeStat()] });

    page.setWithRejected(true);
    await settle(fixture);

    expect(repo.lastFilter?.withRejected).toBe(true);
  });

  it('the panel of a stat to review says where it comes from, with Valider and Rejeter', async () => {
    const { fixture, page } = await setup({ rows: [makeScanned()] });

    page.open(makeScanned());
    await settle(fixture);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.review-banner')?.textContent).toContain('stats.review.bannerTitle');
    const panel = el.querySelector('.complete-card')!.textContent;
    expect(panel).toContain('stats.review.validate');
    expect(panel).toContain('stats.review.reject');
    expect(panel).not.toContain('stats.completion.tick');
  });

  it('a rejected stat opened through a link offers « Rétablir », never the ✓', async () => {
    const rejected = makeScanned({ review: 'REJECTED', rejectionReason: 'NEWS' });
    const { fixture, page, repo } = await setup({ rows: [rejected] });

    page.open(rejected);
    await settle(fixture);
    page.toggleCompleted(rejected);

    const panel = fixture.nativeElement.querySelector('.complete-card')!.textContent;
    expect(panel).toContain('stats.review.restore');
    expect(panel).not.toContain('stats.completion.tick');
    expect(page.tickBlockedReason()).toBe('stats.review.tickBlocked');
    expect(repo.setCompleted).not.toHaveBeenCalled();
  });

  it('a rejected stat opened through a link says so in its banner, with its reason', async () => {
    const rejected = makeScanned({ review: 'REJECTED', rejectionReason: 'NEWS' });
    const { fixture, page } = await setup({ rows: [rejected] });

    page.open(rejected);
    await settle(fixture);

    const banner = fixture.nativeElement.querySelector('.review-banner')?.textContent;
    expect(banner).toContain('stats.review.bannerRejectedTitle');
    expect(page.rejectedBanner(rejected)).toBe('stats.review.bannerRejectedBecause');
  });

  it('a rejected stat shows its note in the panel, and on its tag', async () => {
    const rejected = makeScanned({
      review: 'REJECTED',
      rejectionNote: 'The Echo clears the Apex by 12 %',
    });
    const { fixture, page } = await setup({ rows: [rejected] });

    page.open(rejected);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.review-note')).not.toBeNull();
    expect(page.reviewTagHint(rejected)).toBe('stats.review.note');
  });

  it('a rejected stat opened by link shows the rejected ones, so its panel stays open', async () => {
    const rejected = makeScanned({ review: 'REJECTED' });

    const { page, repo } = await setup({
      rows: [rejected],
      query: { stat: rejected.id },
      byId: rejected,
    });

    expect(page.withRejected()).toBe(true);
    expect(repo.lastFilter?.withRejected).toBe(true);
    expect(page.completing()?.id).toBe(rejected.id);
  });

  it('a rejected stat without a note shows none', async () => {
    const rejected = makeScanned({ review: 'REJECTED' });
    const { fixture, page } = await setup({ rows: [rejected] });

    page.open(rejected);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.review-note')).toBeNull();
    expect(page.reviewTagHint(rejected)).toBe('stats.review.tagHint.REJECTED');
  });

  it('a manual stat opens with no scanner banner', async () => {
    const { fixture, page } = await setup({ rows: [makeStat({ completed: false })] });

    page.open(makeStat({ completed: false }));
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.review-banner')).toBeNull();
  });

  it('« Repasser à relire » waits until a ticked stat is unticked', async () => {
    const ticked = makeScanned({ review: 'VALIDATED', completed: true });
    const { fixture, page } = await setup({ rows: [ticked] });

    page.open(ticked);
    await settle(fixture);

    const back = Array.from(fixture.nativeElement.querySelectorAll('.complete-card button')).find(
      (b) => (b as HTMLElement).textContent?.includes('stats.review.unvalidate'),
    );
    expect((back as HTMLButtonElement).disabled).toBe(true);
  });
});
