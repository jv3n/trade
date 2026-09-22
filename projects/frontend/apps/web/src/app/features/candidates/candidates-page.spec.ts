import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideNativeDateAdapter, StbToast } from '@portfolioai/ui';
import { addDays, startOfDay } from 'date-fns';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  BulkPromotion,
  Candidate,
  CandidateInput,
} from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import {
  PagedResult,
  PageRequest,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatSummary,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { CandidatesPage } from './candidates-page';

/**
 * Component spec for the candidates page (morning capture). The formulas are pinned in
 * `candidates.math.spec` ; here we pin the wiring :
 *
 * - **List** — the day's candidates load on init and are sorted by gap, largest first.
 * - **Quick entry** — the save stays blocked until the three premarket prices are valid (PM high
 *   below the PM open included), a submit creates the candidate for the browsed day and resets the
 *   form while keeping the pattern, and a 409 surfaces the dedicated "duplicate" toast.
 * - **Edit** — a row loaded into the form saves as an update.
 * - **Promotion** — « → Stat » and « Promote all » go through the confirmation modal, the bulk
 *   action only targets the candidates still missing from the sheet, and both reload the day.
 * - **Delete** — goes through the confirmation modal ; cancelling never reaches the repository.
 * - **At the open** — the push references of the day's patterns are fetched once per pattern and
 *   handed to the card ; what comes out of the card is patched in place before the save (no
 *   reload), reverted if the save fails, and an edit through the form keeps it. The card itself is
 *   pinned in `open-card.spec`.
 * - **Day navigation** — past days are read-only.
 *
 * The repositories, the confirmation modal and the snackbar are stubbed so nothing touches HTTP.
 */

/** KTTA — the example of `mockup/PARCOURS.md › Étape 1` (gap +52.8 %, push +14.8 %). */
function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c-ktta',
    tradingDate: startOfDay(new Date()),
    pattern: 'GUS',
    ticker: 'KTTA',
    previousClose: 2.65,
    pmOpen: 4.05,
    pmHigh: 4.65,
    floatMillions: 8.2,
    volumeMillions: 3.1,
    locatePerShare: 0.03,
    note: 'Résistance 4,65 — high PM, pas de news',
    openPrice: null,
    targetPushPercent: null,
    promoted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock port — **extends** the abstract `CandidatesRepository` so the stub stays type-safe against
 * the real contract (`useClass MockXxx extends XxxRepository`, never a bare `useValue`).
 */
class MockCandidatesRepository extends CandidatesRepository {
  listForDate = vi.fn((_date: Date): Observable<Candidate[]> => of([]));
  create = vi.fn((input: CandidateInput): Observable<Candidate> =>
    of(makeCandidate({ ...input, id: 'new', ticker: input.ticker.toUpperCase() })),
  );
  update = vi.fn((id: string, input: CandidateInput): Observable<Candidate> =>
    of(makeCandidate({ ...input, id })),
  );
  delete = vi.fn((_id: string): Observable<void> => of(undefined));
  promote = vi.fn((_id: string): Observable<void> => of(undefined));
  promoteDay = vi.fn((_date: Date): Observable<BulkPromotion> =>
    of({ promoted: ['KTTA'], skipped: [] }),
  );
}

/**
 * Mock stats port — only [summary] matters here : it carries the push references of the card. The
 * figures are the stats page mockup's.
 */
class MockStatsRepository extends StatsRepository {
  findAll = vi.fn(
    (_filter?: StatEntryFilter, _page?: PageRequest): Observable<PagedResult<StatEntry>> =>
      throwError(() => new Error('not used')),
  );
  findById = vi.fn((_id: string): Observable<StatEntry> => throwError(() => new Error('not used')));
  create = vi.fn((_input: StatEntryInput): Observable<StatEntry> =>
    throwError(() => new Error('not used')),
  );
  summary = vi.fn((_filter?: StatEntryFilter): Observable<StatSummary> =>
    of({
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
    }),
  );
  update = vi.fn((_id: string, _input: StatEntryInput): Observable<StatEntry> =>
    throwError(() => new Error('not used')),
  );
  setCompleted = vi.fn((_id: string, _completed: boolean): Observable<StatEntry> =>
    throwError(() => new Error('not used')),
  );
  delete = vi.fn((_id: string): Observable<void> => throwError(() => new Error('not used')));
  promoteToTrade = vi.fn((_id: string): Observable<TradeEntry> =>
    throwError(() => new Error('not used')),
  );
  exportCsv = vi.fn((): Observable<Blob> => throwError(() => new Error('not used')));
}

function setup(
  options: { list?: Candidate[]; confirmed?: boolean; referencesFail?: boolean } = {},
): {
  fixture: ComponentFixture<CandidatesPage>;
  page: CandidatesPage;
  repo: MockCandidatesRepository;
  stats: MockStatsRepository;
  toastShown: ReturnType<typeof vi.fn>;
} {
  const toastShown = vi.fn();
  TestBed.configureTestingModule({
    imports: [CandidatesPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      { provide: CandidatesRepository, useClass: MockCandidatesRepository },
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
  const repo = TestBed.inject(CandidatesRepository) as MockCandidatesRepository;
  const stats = TestBed.inject(StatsRepository) as MockStatsRepository;
  repo.listForDate.mockReturnValue(of(options.list ?? []));
  if (options.referencesFail) {
    stats.summary.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
  }
  const fixture = TestBed.createComponent(CandidatesPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, repo, stats, toastShown };
}

/** Types a valid KTTA capture into the form. */
function fillKtta(page: CandidatesPage): void {
  page.captureForm.ticker().value.set('ktta');
  page.setNumber('previousClose', 2.65);
  page.setNumber('pmOpen', 4.05);
  page.setNumber('pmHigh', 4.65);
}

function lastToast(toastShown: ReturnType<typeof vi.fn>): string {
  return toastShown.mock.calls.at(-1)?.[0];
}

describe('CandidatesPage', () => {
  // ---- List ----

  it("loads today's candidates on init", () => {
    const { repo } = setup();

    expect(repo.listForDate).toHaveBeenCalledWith(startOfDay(new Date()));
  });

  it('sorts the day by gap, largest first, with the derived figures', () => {
    const { page } = setup({
      list: [
        makeCandidate({
          id: 'verb',
          ticker: 'VERB',
          previousClose: 5.1,
          pmOpen: 7.8,
          pmHigh: 8.35,
        }),
        makeCandidate({
          id: 'sgbx',
          ticker: 'SGBX',
          previousClose: 1.12,
          pmOpen: 1.85,
          pmHigh: 2.46,
        }),
        makeCandidate(),
      ],
    });

    expect(page.rows().map((r) => r.ticker)).toEqual(['SGBX', 'VERB', 'KTTA']);
    const ktta = page.rows()[2];
    expect(ktta.gap).toBeCloseTo(52.83, 2);
    expect(ktta.push).toBeCloseTo(14.81, 2);
    expect(ktta.locatePct).toBeCloseTo(0.74, 2);
  });

  // ---- Quick entry ----

  it('blocks the save until the ticker and the three premarket prices are set', () => {
    const { page } = setup();
    expect(page.canSave()).toBe(false);

    fillKtta(page);

    expect(page.canSave()).toBe(true);
  });

  it('blocks the save and flags the field when the PM high is below the PM open', () => {
    const { page } = setup();
    fillKtta(page);

    page.setNumber('pmHigh', 3.9);

    expect(page.pmHighBelowOpen()).toBe(true);
    expect(page.canSave()).toBe(false);
  });

  it('previews gap and push while typing', () => {
    const { page } = setup();
    expect(page.gapPreview()).toBeNull();

    fillKtta(page);

    expect(page.gapPreview()).toBeCloseTo(52.83, 2);
    expect(page.pushPreview()).toBeCloseTo(14.81, 2);
  });

  it('creates the candidate for the browsed day, then resets the form but keeps the pattern', () => {
    const { page, repo, toastShown } = setup();
    page.setPattern('DT');
    fillKtta(page);
    page.setNumber('locatePerShare', 0.03);

    page.submit();

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tradingDate: startOfDay(new Date()),
        pattern: 'DT',
        ticker: 'ktta',
        previousClose: 2.65,
        pmOpen: 4.05,
        pmHigh: 4.65,
        locatePerShare: 0.03,
        floatMillions: null,
      }),
    );
    expect(lastToast(toastShown)).toBe('success');
    expect(page.model().ticker).toBe('');
    expect(page.model().pmOpen).toBeNull();
    expect(page.model().pattern).toBe('DT');
    expect(repo.listForDate).toHaveBeenCalledTimes(2); // init + reload after the save
  });

  it('surfaces a duplicate (409) with its own toast and keeps the typed capture', () => {
    const { page, repo, toastShown } = setup();
    repo.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    fillKtta(page);

    page.submit();

    expect(toastShown).toHaveBeenCalledWith('error', 'candidates.snackbar.duplicate');
    expect(page.model().ticker).toBe('ktta');
  });

  // ---- Edit ----

  it('saves a candidate loaded for edit as an update', () => {
    const ktta = makeCandidate();
    const { page, repo } = setup({ list: [ktta] });

    page.edit(ktta);
    page.setNumber('pmHigh', 4.9);
    page.submit();

    expect(repo.update).toHaveBeenCalledWith('c-ktta', expect.objectContaining({ pmHigh: 4.9 }));
    expect(repo.create).not.toHaveBeenCalled();
    expect(page.editingId()).toBeNull();
  });

  // ---- Promotion ----

  it('promotes a candidate once the confirmation modal is confirmed, then reloads the day', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });

    page.promote(makeCandidate());

    expect(repo.promote).toHaveBeenCalledWith('c-ktta');
    expect(lastToast(toastShown)).toBe('success');
    expect(repo.listForDate).toHaveBeenCalledTimes(2); // init + reload
  });

  it('never promotes when the confirmation modal is cancelled', () => {
    const { page, repo } = setup({ list: [makeCandidate()], confirmed: false });

    page.promote(makeCandidate());

    expect(repo.promote).not.toHaveBeenCalled();
  });

  it('toasts an error when a promotion fails', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });
    repo.promote.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

    page.promote(makeCandidate());

    expect(lastToast(toastShown)).toBe('error');
  });

  it('counts only the candidates still missing from the sheet as promotable', () => {
    const { page } = setup({
      list: [
        makeCandidate({ id: 'sgbx', ticker: 'SGBX', promoted: true }),
        makeCandidate({ id: 'bnrg', ticker: 'BNRG' }),
      ],
    });

    expect(page.promotable().map((c) => c.ticker)).toEqual(['BNRG']);
  });

  it('promotes the whole day in one call and reports how many landed', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });

    page.promoteAll();

    expect(repo.promoteDay).toHaveBeenCalledWith(startOfDay(new Date()));
    expect(toastShown).toHaveBeenCalledWith('success', 'candidates.snackbar.promoteAllSuccess');
  });

  it('does nothing when every candidate of the day is already in the sheet', () => {
    const { page, repo } = setup({ list: [makeCandidate({ promoted: true })] });

    page.promoteAll();

    expect(repo.promoteDay).not.toHaveBeenCalled();
  });

  // ---- Delete ----

  it('deletes a candidate once the confirmation modal is confirmed', () => {
    const { page, repo } = setup({ list: [makeCandidate()] });

    page.delete(makeCandidate());

    expect(repo.delete).toHaveBeenCalledWith('c-ktta');
  });

  it('never reaches the repository when the confirmation modal is cancelled', () => {
    const { page, repo } = setup({ list: [makeCandidate()], confirmed: false });

    page.delete(makeCandidate());

    expect(repo.delete).not.toHaveBeenCalled();
  });

  // ---- At the open (#261) ----

  it("fetches the push references of the day's pattern for the card", () => {
    const { page, stats } = setup({ list: [makeCandidate()] });

    expect(stats.summary).toHaveBeenCalledWith({ pattern: 'GUS' });
    expect(page.pushReferences()).toEqual({
      GUS: { median: 6.8, average: 9.6, thirdQuartile: 14.2, max: 21.5 },
    });
  });

  it('fetches the references once per pattern, not on every reload', () => {
    const { page, stats } = setup({ list: [makeCandidate()] });

    page.previousDay();
    page.nextDay();

    expect(stats.summary).toHaveBeenCalledTimes(1);
  });

  it('still lists the candidates when the references cannot be fetched', () => {
    const { page } = setup({ list: [makeCandidate()], referencesFail: true });

    expect(page.rows().length).toBe(1);
    expect(page.pushReferences().GUS?.average).toBeNull();
  });

  it('saves an open coming out of the card and patches the row without reloading the day', () => {
    const ktta = makeCandidate();
    const { page, repo } = setup({ list: [ktta] });

    page.saveAtOpen({ candidate: ktta, patch: { openPrice: 4.2 } });

    expect(repo.update).toHaveBeenCalledWith(
      'c-ktta',
      expect.objectContaining({ ticker: 'KTTA', pmHigh: 4.65, openPrice: 4.2 }),
    );
    expect(page.rows()[0].openPrice).toBe(4.2);
    expect(repo.listForDate).toHaveBeenCalledTimes(1); // init only
  });

  it('starts the push save from the open just typed, not from the stale row', () => {
    // Open then push, typed back to back : the card still holds the row as it was before the open.
    const ktta = makeCandidate();
    const { page, repo } = setup({ list: [ktta] });

    page.saveAtOpen({ candidate: ktta, patch: { openPrice: 4.2 } });
    page.saveAtOpen({ candidate: ktta, patch: { targetPushPercent: 15 } });

    expect(repo.update).toHaveBeenLastCalledWith(
      'c-ktta',
      expect.objectContaining({ openPrice: 4.2, targetPushPercent: 15 }),
    );
  });

  it('reverts the row and toasts an error when the save fails', () => {
    const ktta = makeCandidate();
    const { page, repo, toastShown } = setup({ list: [ktta] });
    repo.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    page.saveAtOpen({ candidate: ktta, patch: { openPrice: 4.2 } });

    expect(page.rows()[0].openPrice).toBeNull();
    expect(lastToast(toastShown)).toBe('error');
  });

  it('keeps what was typed in the card when the candidate is edited through the form', () => {
    // The form has no open nor push field : saving it must not wipe what was typed at 9:30.
    const ktta = makeCandidate({ openPrice: 4.2, targetPushPercent: 15 });
    const { page, repo } = setup({ list: [ktta] });

    page.edit(ktta);
    page.setNumber('pmHigh', 4.9);
    page.submit();

    expect(repo.update).toHaveBeenCalledWith(
      'c-ktta',
      expect.objectContaining({ pmHigh: 4.9, openPrice: 4.2, targetPushPercent: 15 }),
    );
  });

  // ---- Day navigation ----

  it('reloads the list for the previous day and makes it read-only', () => {
    const { page, repo } = setup();
    expect(page.readOnly()).toBe(false);

    page.previousDay();

    expect(repo.listForDate).toHaveBeenLastCalledWith(addDays(startOfDay(new Date()), -1));
    expect(page.readOnly()).toBe(true);
  });
});
