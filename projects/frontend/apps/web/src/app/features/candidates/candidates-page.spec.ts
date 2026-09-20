import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideTranslateService } from '@ngx-translate/core';
import { addDays, startOfDay } from 'date-fns';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  BulkPromotion,
  Candidate,
  CandidateInput,
} from '../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../core/api/candidates/candidates.repository';
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
 * - **Day navigation** — past days are read-only.
 *
 * The repository, the confirmation modal and the snackbar are stubbed so nothing touches HTTP.
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

function setup(options: { list?: Candidate[]; confirmed?: boolean } = {}): {
  fixture: ComponentFixture<CandidatesPage>;
  page: CandidatesPage;
  repo: MockCandidatesRepository;
  snackBarOpen: ReturnType<typeof vi.fn>;
} {
  const snackBarOpen = vi.fn();
  TestBed.configureTestingModule({
    imports: [CandidatesPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      { provide: CandidatesRepository, useClass: MockCandidatesRepository },
      { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      { provide: ConfirmService, useValue: { ask: () => of(options.confirmed ?? true) } },
    ],
  });
  const repo = TestBed.inject(CandidatesRepository) as MockCandidatesRepository;
  repo.listForDate.mockReturnValue(of(options.list ?? []));
  const fixture = TestBed.createComponent(CandidatesPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, repo, snackBarOpen };
}

/** Types a valid KTTA capture into the form. */
function fillKtta(page: CandidatesPage): void {
  page.captureForm.ticker().value.set('ktta');
  page.setNumber('previousClose', 2.65);
  page.setNumber('pmOpen', 4.05);
  page.setNumber('pmHigh', 4.65);
}

function lastToastPanel(snackBarOpen: ReturnType<typeof vi.fn>): string {
  return snackBarOpen.mock.calls.at(-1)?.[2]?.panelClass;
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
    const { page, repo, snackBarOpen } = setup();
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
    expect(lastToastPanel(snackBarOpen)).toBe('stb-snack-bar--success');
    expect(page.model().ticker).toBe('');
    expect(page.model().pmOpen).toBeNull();
    expect(page.model().pattern).toBe('DT');
    expect(repo.listForDate).toHaveBeenCalledTimes(2); // init + reload after the save
  });

  it('surfaces a duplicate (409) with its own toast and keeps the typed capture', () => {
    const { page, repo, snackBarOpen } = setup();
    repo.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    fillKtta(page);

    page.submit();

    expect(snackBarOpen).toHaveBeenCalledWith(
      'candidates.snackbar.duplicate',
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error' }),
    );
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
    const { page, repo, snackBarOpen } = setup({ list: [makeCandidate()] });

    page.promote(makeCandidate());

    expect(repo.promote).toHaveBeenCalledWith('c-ktta');
    expect(lastToastPanel(snackBarOpen)).toBe('stb-snack-bar--success');
    expect(repo.listForDate).toHaveBeenCalledTimes(2); // init + reload
  });

  it('never promotes when the confirmation modal is cancelled', () => {
    const { page, repo } = setup({ list: [makeCandidate()], confirmed: false });

    page.promote(makeCandidate());

    expect(repo.promote).not.toHaveBeenCalled();
  });

  it('toasts an error when a promotion fails', () => {
    const { page, repo, snackBarOpen } = setup({ list: [makeCandidate()] });
    repo.promote.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));

    page.promote(makeCandidate());

    expect(lastToastPanel(snackBarOpen)).toBe('stb-snack-bar--error');
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
    const { page, repo, snackBarOpen } = setup({ list: [makeCandidate()] });

    page.promoteAll();

    expect(repo.promoteDay).toHaveBeenCalledWith(startOfDay(new Date()));
    expect(snackBarOpen).toHaveBeenCalledWith(
      'candidates.snackbar.promoteAllSuccess',
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success' }),
    );
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

  // ---- Day navigation ----

  it('reloads the list for the previous day and makes it read-only', () => {
    const { page, repo } = setup();
    expect(page.readOnly()).toBe(false);

    page.previousDay();

    expect(repo.listForDate).toHaveBeenLastCalledWith(addDays(startOfDay(new Date()), -1));
    expect(page.readOnly()).toBe(true);
  });
});
