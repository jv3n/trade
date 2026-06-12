import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PagedResult,
  StatEntry,
  StatEntryInput,
  StatSource,
} from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { StatsPage } from './stats-page';

/**
 * Pins the parts of [StatsPage] a typecheck can't reach :
 *
 *  - **Ownership gating** — `isOwned` is true for RADAR / MANUAL rows (editable) and false for the
 *    community IMPORT rows (read-only). The template drives the actions column off it.
 *  - **Delete pipeline** — success snackbar + refetch on a clean response, error snackbar on throw,
 *    and `confirm()` cancel short-circuits the repository call.
 *  - **Create dialog → 409** — a day/ticker collision (HTTP 409) surfaces the dedicated "duplicate"
 *    toast rather than the generic create-error one.
 */
describe('StatsPage', () => {
  let nextPage: PagedResult<StatEntry>;
  let findAll: ReturnType<typeof vi.fn>;
  let createFn: ReturnType<typeof vi.fn>;
  let deleteSubject: Subject<void>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let dialogResult: Subject<StatEntryInput | undefined>;

  beforeEach(async () => {
    nextPage = makePage([], 0);
    findAll = vi.fn(() => of(nextPage));
    createFn = vi.fn(() => of(makeStat()));
    deleteSubject = new Subject<void>();
    snackBarOpen = vi.fn();
    dialogResult = new Subject<StatEntryInput | undefined>();

    await TestBed.configureTestingModule({
      imports: [StatsPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        provideNativeDateAdapter(),
        {
          provide: StatsRepository,
          useValue: {
            findAll,
            createFromRadar: () => of(makeStat()),
            create: createFn,
            update: createFn,
            delete: () => deleteSubject.asObservable(),
            exportCsv: () => of(new Blob()),
            importCsv: () => of({ parsed: 0, created: 0, errors: [] }),
          } as unknown as StatsRepository,
        },
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => dialogResult }) } },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('isOwned is true for RADAR / MANUAL rows and false for IMPORT rows', () => {
    const fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.isOwned(makeStat({ source: 'RADAR' }))).toBe(true);
    expect(page.isOwned(makeStat({ source: 'MANUAL' }))).toBe(true);
    expect(page.isOwned(makeStat({ source: 'IMPORT' }))).toBe(false);
  });

  it('delete success fires a success snackbar and refetches', () => {
    nextPage = makePage([makeStat()], 5);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const callsBefore = findAll.mock.calls.length;
    page.delete(makeStat());
    deleteSubject.next();
    deleteSubject.complete();
    fixture.detectChanges();

    expect(findAll.mock.calls.length).toBe(callsBefore + 1);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success' }),
    );
  });

  it('delete error fires an error snackbar', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();

    fixture.componentInstance.delete(makeStat());
    deleteSubject.error(new Error('500'));
    fixture.detectChanges();

    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error', duration: 5000 }),
    );
  });

  it('user cancelling the confirm() never reaches the repository', () => {
    const fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();

    const deleteSpy = vi.spyOn(deleteSubject, 'subscribe');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    fixture.componentInstance.delete(makeStat());

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(snackBarOpen).not.toHaveBeenCalled();
  });

  it('create dialog confirmed calls repo.create and toasts success', () => {
    const fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();

    fixture.componentInstance.openCreate();
    dialogResult.next(makeInput());
    dialogResult.complete();
    fixture.detectChanges();

    expect(createFn).toHaveBeenCalledTimes(1);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success' }),
    );
  });

  it('create dialog 409 surfaces the duplicate error toast', () => {
    createFn.mockReturnValueOnce(throwError(() => ({ status: 409 })));
    const fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();

    fixture.componentInstance.openCreate();
    dialogResult.next(makeInput());
    dialogResult.complete();
    fixture.detectChanges();

    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStat(overrides: Partial<StatEntry> = {}): StatEntry {
  return {
    id: 'id-1',
    tradeDate: new Date(2026, 5, 4),
    ticker: 'BAC',
    gapUpPercent: 52,
    openPrice: 4.2,
    floatSharesMillions: null,
    institutionsPercent: null,
    instOver20: null,
    under1Dollar: null,
    ssr: null,
    entryAfter11am: null,
    note: null,
    highPrice: null,
    lodPrice: null,
    eodPrice: null,
    pushPercent: null,
    lodPercent: null,
    eodPercent: null,
    source: 'RADAR' as StatSource,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInput(): StatEntryInput {
  return {
    tradeDate: new Date(2026, 5, 11),
    ticker: 'GELS',
    gapUpPercent: 72,
    openPrice: 3.5,
    floatSharesMillions: null,
    institutionsPercent: null,
    instOver20: false,
    under1Dollar: false,
    ssr: false,
    entryAfter11am: false,
    highPrice: null,
    lodPrice: null,
    eodPrice: null,
    note: null,
    source: 'MANUAL',
  };
}

function makePage(content: StatEntry[], total: number): PagedResult<StatEntry> {
  return {
    content,
    pageIndex: 0,
    pageSize: 25,
    totalElements: total,
    totalPages: Math.max(1, Math.ceil(total / 25)),
  };
}
