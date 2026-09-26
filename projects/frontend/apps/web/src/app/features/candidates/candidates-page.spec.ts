import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideNativeDateAdapter, StbToast } from '@portfolioai/ui';
import { addDays, startOfDay } from 'date-fns';
import { Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  BulkPromotion,
  Candidate,
  CandidateInput,
} from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import { Pattern } from '../../core/api/shared/pattern.model';
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
 *   below the PM open included), a submit creates the candidate — with no pattern — for the browsed
 *   day and resets the form, and a 409 surfaces the dedicated "duplicate" toast.
 * - **Edit** — a row loaded into the form saves as an update.
 * - **Promotion (#436)** — « → GUS » / « → DT » and « Tout passer en GUS » go through the
 *   confirmation modal and reload the day ; a candidate gets one stat per pattern, one badge each,
 *   and the button of a pattern it already has is gone. The bulk action only targets the
 *   candidates without any stat, and its toast names the ones left alone.
 * - **Delete** — goes through the confirmation modal ; cancelling never reaches the repository.
 * - **At the open** — the GUS push references are fetched once and handed to the card, which leaves
 *   out a candidate whose only stat is a DT ; what comes out of the card is patched in place before the save (no
 *   reload), reverted if the save fails, and an edit through the form keeps it. The card itself is
 *   pinned in `open-card.spec`.
 * - **The form is clean after a save** (#315) — no value survives into the next capture, not even
 *   the field that held the focus, and a ticker already captured that day is flagged while typing.
 *   That first one rides on blur / focus ordering and on Signal Forms' `reset()` : if an Angular
 *   migration ever changes either, this is where it shows.
 * - **Day navigation** — past days are read-only.
 *
 * The repositories, the confirmation modal and the snackbar are stubbed so nothing touches HTTP.
 */

/** KTTA — the example of `mockup/PARCOURS.md › Étape 1` (gap +52.8 %, push +14.8 %). */
function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c-ktta',
    tradingDate: startOfDay(new Date()),
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
    stats: [],
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
  promote = vi.fn((_id: string, _pattern: Pattern): Observable<void> => of(undefined));
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
      provideRouter([]),
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

  it('creates the candidate for the browsed day, without a pattern, then resets the form', () => {
    const { page, repo, toastShown } = setup();
    fillKtta(page);
    page.setNumber('locatePerShare', 0.03);

    page.submit();

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tradingDate: startOfDay(new Date()),
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
    expect(repo.create.mock.calls[0][0]).not.toHaveProperty('pattern');
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

  // The trap behind #315 : `resetForm` gives the focus back to the ticker, which fires `blur` on
  // the field being typed — and the mask answers a blur by pushing the text it still shows back
  // into the model. The cleared value came back and rode into the next candidate of the morning.
  it('an edited field does not write itself back when the form resets', async () => {
    const ktta = makeCandidate();
    const { fixture, page, repo } = setup({ list: [ktta] });
    page.edit(ktta);
    fixture.detectChanges();
    await fixture.whenStable();

    const pmHigh = fixture.nativeElement.querySelectorAll(
      'input[appNumberMask]',
    )[2] as HTMLInputElement;
    pmHigh.focus();
    // Above the PM open (4.05) : below it the save is blocked and the form never resets.
    pmHigh.value = '5';
    pmHigh.dispatchEvent(new Event('input'));

    page.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    // The typed value did reach the save — it is the *reset* that must not give it back.
    expect(repo.update).toHaveBeenCalledWith('c-ktta', expect.objectContaining({ pmHigh: 5 }));
    expect(page.model().pmHigh).toBeNull();
    expect(page.model().ticker).toBe('');
    expect(pmHigh.value).toBe('');
  });

  it('flags a ticker already captured that day while it is typed, and blocks the save', () => {
    const { page } = setup({ list: [makeCandidate()] });
    fillKtta(page);

    expect(page.duplicateTicker()).toBe(true);
    expect(page.canSave()).toBe(false);
  });

  it('an edited candidate is not its own duplicate', () => {
    const ktta = makeCandidate();
    const { page } = setup({ list: [ktta] });

    page.edit(ktta);

    expect(page.duplicateTicker()).toBe(false);
    expect(page.canSave()).toBe(true);
  });

  // ---- Promotion ----

  it('promotes a candidate in the pattern asked once the modal is confirmed, then reloads the day', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });

    page.promote(makeCandidate(), 'DT');

    expect(repo.promote).toHaveBeenCalledWith('c-ktta', 'DT');
    expect(lastToast(toastShown)).toBe('success');
    expect(repo.listForDate).toHaveBeenCalledTimes(2); // init + reload
  });

  it('never promotes when the confirmation modal is cancelled', () => {
    const { page, repo } = setup({ list: [makeCandidate()], confirmed: false });

    page.promote(makeCandidate(), 'GUS');

    expect(repo.promote).not.toHaveBeenCalled();
  });

  it('toasts an error when a promotion fails', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });
    repo.promote.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

    page.promote(makeCandidate(), 'GUS');

    expect(lastToast(toastShown)).toBe('error');
  });

  it('counts only the candidates without any stat as promotable to GUS — a DT only one included', () => {
    const { page } = setup({
      list: [
        makeCandidate({
          id: 'nxtt',
          ticker: 'NXTT',
          stats: [{ pattern: 'DT', statId: 'st-nxtt' }],
        }),
        makeCandidate({ id: 'bnrg', ticker: 'BNRG' }),
      ],
    });

    expect(page.promotable().map((c) => c.ticker)).toEqual(['BNRG']);
  });

  it('offers the patterns a candidate has no stat in yet', () => {
    const { page } = setup({
      list: [
        makeCandidate({ id: 'sgbx', ticker: 'SGBX', stats: [{ pattern: 'GUS', statId: 'st' }] }),
        makeCandidate({ id: 'bnrg', ticker: 'BNRG' }),
      ],
    });

    const promotableTo = Object.fromEntries(page.rows().map((r) => [r.ticker, r.promotableTo]));
    expect(promotableTo).toEqual({ SGBX: ['DT'], BNRG: ['GUS', 'DT'] });
  });

  it('promotes the whole day in one call and reports how many landed, in the singular for one', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });

    page.promoteAll();

    expect(repo.promoteDay).toHaveBeenCalledWith(startOfDay(new Date()));
    expect(toastShown).toHaveBeenCalledWith('success', 'candidates.snackbar.promoteAllSuccessOne');
  });

  it('names the candidates the bulk promotion left alone in its toast', () => {
    const { page, repo, toastShown } = setup({ list: [makeCandidate()] });
    repo.promoteDay.mockReturnValue(of({ promoted: ['BNRG', 'MLGO'], skipped: ['SGBX'] }));

    page.promoteAll();

    expect(toastShown).toHaveBeenCalledWith(
      'success',
      'candidates.snackbar.promoteAllSuccess candidates.snackbar.promoteAllSkippedOne',
    );
  });

  // #383 : the badge used to be plain text, so the moment you'd jump to the new stat was the moment
  // the link disappeared. SGBX of the mockup : a GUS in the morning, a double top late in the morning.
  it('shows one badge per stat, each opening its own stat, and no button left to promote', async () => {
    const { fixture } = setup({
      list: [
        makeCandidate({
          ticker: 'SGBX',
          stats: [
            { pattern: 'GUS', statId: 'stat-sgbx-gus' },
            { pattern: 'DT', statId: 'stat-sgbx-dt' },
          ],
        }),
      ],
    });
    await fixture.whenStable();

    const links = [...fixture.nativeElement.querySelectorAll('a.stats-tag')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/stats?stat=stat-sgbx-gus',
      '/stats?stat=stat-sgbx-dt',
    ]);
    expect(links.map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'check patterns.short.GUS',
      'check patterns.short.DT',
    ]);
    const buttons = [...fixture.nativeElement.querySelectorAll('td button')] as HTMLElement[];
    expect(buttons.some((b) => b.textContent?.includes('arrow_forward'))).toBe(false);
  });

  it('does nothing when every candidate of the day already has a stat', () => {
    const { page, repo } = setup({
      list: [makeCandidate({ stats: [{ pattern: 'GUS', statId: 'st' }] })],
    });

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

  it('fetches the GUS push references and the no-push rate for the card', () => {
    const { page, stats } = setup({ list: [makeCandidate()] });

    expect(stats.summary).toHaveBeenCalledWith({ pattern: 'GUS' });
    expect(page.pushReferences()).toEqual({
      median: 6.8,
      average: 9.6,
      thirdQuartile: 14.2,
      max: 21.5,
    });
    // The no-push rate comes with them, over the same completed stats (#332).
    expect(page.noPushRate()).toEqual({ noPush: 0, completed: 10 });
  });

  it('leaves a candidate whose only stat is a DT out of the card', () => {
    const { page } = setup({
      list: [
        makeCandidate({ id: 'nxtt', ticker: 'NXTT', stats: [{ pattern: 'DT', statId: 'st-n' }] }),
        makeCandidate({
          id: 'sgbx',
          ticker: 'SGBX',
          stats: [
            { pattern: 'GUS', statId: 'st-g' },
            { pattern: 'DT', statId: 'st-d' },
          ],
        }),
        makeCandidate({ id: 'bnrg', ticker: 'BNRG' }),
      ],
    });

    expect(page.openRows().map((c) => c.ticker)).toEqual(['SGBX', 'BNRG']);
  });

  it('fetches the references once, not on every reload', () => {
    const { page, stats } = setup({ list: [makeCandidate()] });

    page.previousDay();
    page.nextDay();

    expect(stats.summary).toHaveBeenCalledTimes(1);
  });

  it('still lists the candidates when the references cannot be fetched', () => {
    const { page } = setup({ list: [makeCandidate()], referencesFail: true });

    expect(page.rows().length).toBe(1);
    expect(page.pushReferences()?.average).toBeNull();
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

  // #370 : a slow answer for the day left behind landed on the day being browsed.
  it('keeps the list of the day left until the next one arrives, and drops a stale answer', () => {
    const { fixture, page, repo } = setup({ list: [makeCandidate()] });
    const dayBefore = new Subject<Candidate[]>();
    const twoDaysBefore = new Subject<Candidate[]>();
    repo.listForDate.mockReturnValueOnce(dayBefore).mockReturnValueOnce(twoDaysBefore);

    page.previousDay();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stb-table--busy')).not.toBeNull();

    page.previousDay();
    twoDaysBefore.next([makeCandidate({ id: 'c-bnrg', ticker: 'BNRG' })]);
    twoDaysBefore.complete();
    dayBefore.next([makeCandidate({ id: 'c-slnh', ticker: 'SLNH' })]);

    expect(page.rows().map((c) => c.ticker)).toEqual(['BNRG']);
    expect(page.loading()).toBe(false);
  });

  // #320 : Sunday 2026-09-20 read « no candidate on this day », as if a session had been missed.
  it('says there is no session on a weekend day', () => {
    const { fixture, page } = setup();
    page.day.set(new Date(2026, 8, 20));
    fixture.detectChanges();

    expect(page.weekend()).toBe(true);
    expect(fixture.nativeElement.querySelector('.empty-state').textContent).toContain(
      'candidates.list.weekend',
    );
  });
});
