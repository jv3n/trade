import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JournalRepository, PagedResult } from '../../core/api/journal/journal.repository';
import { TradeEntry } from '../../core/api/journal/trade-entry.model';
import { JournalPage } from './journal-page';

/**
 * Pins the delete pipeline of [JournalPage]. Four regressions this file catches that a
 * typecheck alone can't :
 *
 *  - **The delete edge case** — deleting the **last** row of a non-zero page must decrement
 *    `pageIndex` instead of refetching the now-empty page. Without this, the user lands on
 *    an empty table for that page index until they manually click "previous".
 *  - **Multi-row delete refetches the current page** — the standard path. We trust the server
 *    for both the page content AND the total count, no local splicing.
 *  - **Snackbar variant matches the outcome** — `success` panel on a clean response, `error`
 *    panel when the repository throws.
 *  - **`confirm()` cancel short-circuits the call** — no delete request fires when the user
 *    backs out of the native confirm dialog.
 *
 * The CRUD dialog flows (create / update via `MatDialog`) are not exercised here — they
 * compose the same `tap` / `catchError` shape as `delete` but route through `MatDialog`,
 * which we stub to a no-op. Add a dedicated test if the dialog logic grows enough to warrant
 * pinning.
 */
describe('JournalPage', () => {
  let nextPage: PagedResult<TradeEntry>;
  let findAll: ReturnType<typeof vi.fn>;
  let deleteSubject: Subject<void>;
  let snackBarOpen: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    nextPage = makePage([], 0);
    findAll = vi.fn(() => of(nextPage));
    deleteSubject = new Subject<void>();
    snackBarOpen = vi.fn();

    await TestBed.configureTestingModule({
      imports: [JournalPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        // The filter drawer hosts two `<mat-datepicker>` widgets. `MatDatepickerInput` reaches
        // for a `DateAdapter` at construction time ; without one the template fails to compile
        // and every test in this file ends up reporting the same "No DateAdapter" trace
        // instead of the actual delete logic regression we care about.
        provideNativeDateAdapter(),
        {
          provide: JournalRepository,
          useValue: {
            findAll,
            findById: () => of({} as unknown),
            create: () => of({} as unknown),
            update: () => of({} as unknown),
            delete: () => deleteSubject.asObservable(),
            exportCsv: () => of(new Blob()),
            importCsv: () => of({ parsed: 0, created: 0, errors: [] }),
          } as unknown as JournalRepository,
        },
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => of(undefined) }) },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  // ---------------------------------------------------------------------------
  // delete() — edge case : last row of a non-zero page
  // ---------------------------------------------------------------------------

  it('delete on the last row of a non-zero page decrements pageIndex instead of refetching', () => {
    // 21 trades total, 10 per page → page 2 carries the single 21st row. Deleting it would
    // leave page 2 with zero rows after a naive refetch.
    nextPage = makePage([makeTrade()], 21);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

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
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success' }),
    );
  });

  it('delete on the last row of page 0 does NOT decrement pageIndex (refetches in place)', () => {
    // Only one trade, on page 0. The naive refetch is correct here — we don't want to bump
    // pageIndex into negative territory.
    nextPage = makePage([makeTrade()], 1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

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
    vi.spyOn(window, 'confirm').mockReturnValue(true);

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
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.delete(makeTrade());
    deleteSubject.error(new Error('500 from server'));
    fixture.detectChanges();

    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        panelClass: 'stb-snack-bar--error',
        duration: 5000,
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // delete() — confirm() cancel
  // ---------------------------------------------------------------------------

  it('user cancelling the confirm() never reaches the repository', () => {
    const fixture = TestBed.createComponent(JournalPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const deleteSpy = vi.spyOn(deleteSubject, 'subscribe');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    page.delete(makeTrade());

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(snackBarOpen).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    id: 'id-1',
    tradeDate: new Date(2026, 5, 4),
    ticker: 'BAC',
    direction: 'SHORT',
    executions: [{ seq: 0, kind: 'ENTRY', shares: 100, price: 3.21 }],
    play: 'A',
    pattern: 'GUS',
    size: 100,
    openPrice: 3.21,
    exitPrice: null,
    profitDollars: null,
    gainPercent: null,
    note: null,
    pre935To10h: null,
    preGapUp50: null,
    prePrice1To10: null,
    preFloat3To50m: null,
    preWaitPush: null,
    openSide: null,
    shortOnResistance: null,
    exitStrategy: null,
    errorNote: null,
    statEntryId: null,
    hasScreenshot: false,
    createdAt: new Date(),
    updatedAt: new Date(),
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
