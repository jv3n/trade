import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast } from '@portfolioai/ui';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JournalRepository } from '../../../core/api/journal/journal.repository';
import { TradeEntry, TradeEntryInput } from '../../../core/api/journal/trade-entry.model';
import { StatEntry } from '../../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { JournalDetailPage } from './journal-detail-page';

/**
 * Pins the trade page (#194) — the sheet where a trade born from a stat gets its executions, its
 * real P&L and its debrief. What matters here :
 *
 * - **Two loads on init** : the trade by route id, then the stat behind `statEntryId` for the
 *   read-only day context (with the percentages the stats sheet derives).
 * - **The three P&L figures** : computed from the executions, real as typed, and the live gap —
 *   plus the retained one (real if typed, else computed) that reaches the account.
 * - **The draft** : the page edits a buffer, the save bar only shows up once it drifts, and Cancel
 *   puts the persisted trade back. Fill times enter it as `HH:mm`, like the time input returns them.
 * - **Save sends the whole trade** : the stat-borne identity is carried through untouched,
 *   half-typed execution rows are dropped, and an inconsistent set blocks the call entirely.
 * - **Delete (confirmed)** navigates back to the journal.
 */
describe('JournalDetailPage', () => {
  let findById: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let statFindById: ReturnType<typeof vi.fn>;
  let deleteSubject: Subject<void>;
  /** What the (stubbed) confirmation modal answers — confirmed unless a test says otherwise. */
  let confirmed: boolean;
  let deleteScreenshot: ReturnType<typeof vi.fn>;

  // Default doubles — a test overrides the one it is about, before calling `setup()`.
  beforeEach(() => {
    findById = vi.fn(() => of(makeTrade()));
    update = vi.fn((_id: string, _input: TradeEntryInput) => of(makeTrade()));
    statFindById = vi.fn(() => of(makeStat()));
  });

  function setup() {
    deleteSubject = new Subject<void>();
    confirmed = true;
    deleteScreenshot = vi.fn(() => of(makeTrade({ hasScreenshot: false })));
    TestBed.configureTestingModule({
      imports: [JournalDetailPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: JournalRepository,
          useValue: {
            findById,
            update,
            delete: () => deleteSubject.asObservable(),
            uploadScreenshot: () => of(makeTrade({ hasScreenshot: true })),
            getScreenshotBlob: () => of(new Blob()),
            deleteScreenshot,
          } as unknown as JournalRepository,
        },
        {
          provide: StatsRepository,
          useValue: { findById: statFindById } as unknown as StatsRepository,
        },
        { provide: StbToast, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: () => of(confirmed) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'abc-123' } } },
        },
      ],
    });
    return TestBed.createComponent(JournalDetailPage);
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('loads the trade by route id and the stat behind it for the day context', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(findById).toHaveBeenCalledWith('abc-123');
    expect(statFindById).toHaveBeenCalledWith('stat-1');
    expect(page.entry()?.ticker).toBe('KTTA');
    // Percentages come from the stats sheet formulas — gap = pmOpen vs previous close.
    expect(page.context()?.gap).toBeCloseTo(52.83, 2);
    expect(page.context()?.lodPercent).toBeCloseTo(-18.81, 2);
  });

  it('keeps the page usable when the day context fails to load', () => {
    findById = vi.fn(() => of(closedTrade()));
    statFindById = vi.fn(() => throwError(() => new Error('boom')));
    const fixture = setup();
    fixture.detectChanges();

    expect(fixture.componentInstance.context()).toBeNull();
    expect(fixture.componentInstance.entry()).not.toBeNull();
  });

  it('derives the position, its duration and the computed P&L from the executions', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.preview().size).toBe(350);
    expect(page.preview().status).toBe('CLOSED');
    // Short 350 at 4.50 avg, covered at 3.66 avg → +294 $.
    expect(page.pnl().computed).toBeCloseTo(294, 2);
    expect(page.duration()).toEqual({ hours: 3, minutes: 34 });
    expect(page.timeRange()).toEqual({ first: '09:41', last: '13:15' });
  });

  it('retains the computed P&L while no real one is typed', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();

    expect(fixture.componentInstance.pnl().real).toBeNull();
    expect(fixture.componentInstance.pnl().gap).toBeNull();
    expect(fixture.componentInstance.pnl().retained).toBeCloseTo(294, 2);
  });

  it('shows the gap live as soon as the broker P&L is typed, and retains that one', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.setRealProfit(291.85);

    expect(page.pnl().gap).toBeCloseTo(-2.15, 2);
    expect(page.pnl().retained).toBeCloseTo(291.85, 2);
    // % of the cost basis of the closed part (350 × 4.50).
    expect(page.pnl().retainedPercent).toBeCloseTo(18.53, 2);
  });

  // Hit in the pilot test : 592.15 $ typed on a still-open short reached the account (#304).
  it('keeps the broker P&L out of an open position, in the figures and in what is saved', () => {
    const openShort = makeTrade({
      executions: [{ seq: 0, kind: 'ENTRY', shares: 500, price: 8.4, executedAt: '09:41' }],
    });
    findById = vi.fn(() => of(openShort));
    update = vi.fn((_id: string, _input: TradeEntryInput) => of(openShort));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.setRealProfit(592.15);

    expect(page.realAllowed()).toBe(false);
    expect(page.pnl().retained).toBeNull();
    page.save();
    const [, input] = update.mock.calls[0] as [string, TradeEntryInput];
    expect(input.realProfitDollars).toBeNull();
  });

  it('warns that Save erases the broker P&L of a trade whose position was reopened', () => {
    const closed = closedTrade();
    findById = vi.fn(() => of({ ...closed, realProfitDollars: 746.34 }));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.realToBeErased()).toBeNull();

    page.removeExecution(3); // the last cover : 200 shares are open again

    expect(page.realToBeErased()).toBe(746.34);
  });

  it('asks before a Save that erases the broker P&L, and saves nothing when cancelled', () => {
    findById = vi.fn(() => of({ ...closedTrade(), realProfitDollars: 746.34 }));
    const fixture = setup();
    confirmed = false;
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.removeExecution(3);

    page.save();

    expect(ask).toHaveBeenCalledWith('journal.confirmEraseReal', {
      params: { amount: '746.34' },
      variant: 'danger',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('disables the broker P&L field until the position is closed', () => {
    findById = vi.fn(() =>
      of(
        makeTrade({
          executions: [{ seq: 0, kind: 'ENTRY', shares: 500, price: 8.4, executedAt: '09:41' }],
        }),
      ),
    );
    const fixture = setup();
    fixture.detectChanges();
    const realInput = (): HTMLInputElement =>
      fixture.nativeElement.querySelector('[data-testid="real-pnl"]');

    expect(realInput().disabled).toBe(true);

    const page = fixture.componentInstance;
    page.addExecution();
    page.setExecutionShares(1, 500);
    page.setExecutionPrice(1, 7.2);
    fixture.detectChanges();

    expect(page.realAllowed()).toBe(true);
    expect(realInput().disabled).toBe(false);
  });

  it('the save bar only shows up once the draft drifts, and Cancel puts the trade back', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.dirty()).toBe(false);

    page.setErrorNote('Covered the second half too early.');
    expect(page.dirty()).toBe(true);

    page.cancel();
    expect(page.dirty()).toBe(false);
    expect(page.draft()?.errorNote).toBe('');
  });

  // Seen on staging (#331) : the API sends `09:38:00`, the time input hands back `09:38` once
  // touched — re-picking the same fill time raised the save bar and the leave confirmation.
  it('shows fill times without seconds, and re-picking the same one leaves the trade clean', () => {
    findById = vi.fn(() =>
      of(
        makeTrade({
          executions: [{ seq: 0, kind: 'ENTRY', shares: 200, price: 4.41, executedAt: '09:38:00' }],
        }),
      ),
    );
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const pick = (value: string) =>
      page.setExecutionTime(0, { target: { value } } as unknown as Event);

    expect(page.draft()?.executions[0].executedAt).toBe('09:38');

    pick('09:38');
    expect(page.dirty()).toBe(false);

    pick('09:45');
    expect(page.dirty()).toBe(true);
  });

  // Hit twice in the pilot test : leaving the page dropped the post-mortem without a word (#303).
  it('reports unsaved changes to the leave guard, and asks the browser on tab close', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(page.hasUnsavedChanges()).toBe(false);
    expect(unload()).toBe(false);

    page.setNote('Covered too early, the fade had room to run.');

    expect(page.hasUnsavedChanges()).toBe(true);
    expect(unload()).toBe(true);
  });

  it('leaves without asking once the trade is deleted', () => {
    findById = vi.fn(() => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.setNote('Half-written debrief');

    page.delete();
    deleteSubject.next();

    expect(page.hasUnsavedChanges()).toBe(false);
  });

  it('a new fill defaults to a cover while shares are still open', () => {
    findById = vi.fn(() =>
      of(
        makeTrade({
          executions: [{ seq: 0, kind: 'ENTRY', shares: 200, price: 4.41, executedAt: '09:41' }],
        }),
      ),
    );
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.addExecution();

    expect(page.draft()?.executions.at(-1)?.kind).toBe('EXIT');
  });

  it('save sends the whole trade back, identity included, and drops half-typed fills', () => {
    findById = vi.fn(() => of(closedTrade()));
    update = vi.fn((_id: string, _input: TradeEntryInput) => of(closedTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.addExecution(); // left blank on purpose — it must not reach the backend
    page.setRealProfit(291.85);
    page.setNote('  Rejected under the premarket high.  ');
    page.save();

    expect(update).toHaveBeenCalledTimes(1);
    const [id, input] = update.mock.calls[0] as [string, TradeEntryInput];
    expect(id).toBe('abc-123');
    expect(input.statEntryId).toBe('stat-1');
    expect(input.ticker).toBe('KTTA');
    expect(input.pattern).toBe('GUS');
    expect(input.direction).toBe('SHORT');
    expect(input.executions).toHaveLength(4);
    expect(input.realProfitDollars).toBe(291.85);
    expect(input.note).toBe('Rejected under the premarket high.');
    // The response becomes the new baseline — the save bar goes away with it.
    expect(page.dirty()).toBe(false);
  });

  it('refuses to save a set that covers more shares than it shorted', () => {
    findById = vi.fn(() =>
      of(
        makeTrade({
          executions: [
            { seq: 0, kind: 'ENTRY', shares: 100, price: 4.41, executedAt: '09:41' },
            { seq: 1, kind: 'EXIT', shares: 300, price: 3.78, executedAt: '10:48' },
          ],
        }),
      ),
    );
    update = vi.fn((_id: string, _input: TradeEntryInput) => of(makeTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.executionInvalid()).toBe(true);
    page.save();

    expect(update).not.toHaveBeenCalled();
  });

  it('delete (confirmed) navigates back to the journal', () => {
    findById = vi.fn(() => of(makeTrade()));
    const fixture = setup();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.delete();
    deleteSubject.next();
    deleteSubject.complete();

    expect(navigate).toHaveBeenCalledWith(['/journal']);
  });

  it('removeScreenshot calls the repository and clears the flag on the entry', () => {
    // Start without a screenshot so load() doesn't reach for a blob (jsdom has no
    // URL.createObjectURL) — we're pinning the delete wiring, not the object-URL preview.
    findById = vi.fn(() => of(makeTrade()));
    const fixture = setup();
    fixture.detectChanges();

    fixture.componentInstance.removeScreenshot();

    expect(deleteScreenshot).toHaveBeenCalledWith('abc-123');
    expect(fixture.componentInstance.entry()?.hasScreenshot).toBe(false);
  });
});

/** The KTTA short of the mockup : two shorts, two covers, position closed. */
function closedTrade(): TradeEntry {
  return makeTrade({
    executions: [
      { seq: 0, kind: 'ENTRY', shares: 200, price: 4.41, executedAt: '09:41' },
      { seq: 1, kind: 'ENTRY', shares: 150, price: 4.62, executedAt: '09:52' },
      { seq: 2, kind: 'EXIT', shares: 150, price: 3.78, executedAt: '10:48' },
      { seq: 3, kind: 'EXIT', shares: 200, price: 3.57, executedAt: '13:15' },
    ],
  });
}

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    id: 'abc-123',
    statEntryId: 'stat-1',
    tradeDate: new Date(2026, 8, 17),
    ticker: 'KTTA',
    pattern: 'GUS',
    direction: 'SHORT',
    executions: [],
    size: null,
    openPrice: null,
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

/** The completed stat of the same day — the day context the trade page reads. */
function makeStat(overrides: Partial<StatEntry> = {}): StatEntry {
  return {
    id: 'stat-1',
    candidateId: null,
    tradeDate: new Date(2026, 8, 17),
    pattern: 'GUS',
    ticker: 'KTTA',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    floatMillions: 8.2,
    volumeMillions: 3.1,
    locatePerShare: 0.03,
    note: null,
    openPrice: 4.2,
    pushOpenPrice: 4.62,
    hodPrice: 4.62,
    lodPrice: 3.41,
    eodPrice: 3.52,
    ssr: true,
    under1Dollar: false,
    entryAfter11am: false,
    noPush: false,
    highInstitutions: false,
    completed: true,
    tradeId: 'abc-123',
    tradeRetainedProfitDollars: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
