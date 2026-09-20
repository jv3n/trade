import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JournalRepository } from '../../../core/api/journal/journal.repository';
import { TradeEntry } from '../../../core/api/journal/trade-entry.model';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { JournalDetailPage } from './journal-detail-page';

/**
 * Pins [JournalDetailPage] : it loads the trade by route id, derives the fill status from the
 * executions, and on delete (confirmed) navigates back to the journal list.
 */
describe('JournalDetailPage', () => {
  let findById: ReturnType<typeof vi.fn>;
  let deleteSubject: Subject<void>;
  /** What the (stubbed) confirmation modal answers — confirmed unless a test says otherwise. */
  let confirmed: boolean;
  let deleteScreenshot: ReturnType<typeof vi.fn>;

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
            update: () => of(makeTrade()),
            delete: () => deleteSubject.asObservable(),
            uploadScreenshot: () => of(makeTrade({ hasScreenshot: true })),
            getScreenshotBlob: () => of(new Blob()),
            deleteScreenshot,
          } as unknown as JournalRepository,
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: () => of(confirmed) } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } },
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

  it('loads the trade by id and derives a CLOSED status from the executions', () => {
    findById = vi.fn(() =>
      of(
        makeTrade({
          direction: 'SHORT',
          executions: [
            { seq: 0, kind: 'ENTRY', shares: 100, price: 5, executedAt: '09:42' },
            { seq: 1, kind: 'EXIT', shares: 100, price: 4, executedAt: '10:15' },
          ],
        }),
      ),
    );
    const fixture = setup();
    fixture.detectChanges();

    expect(findById).toHaveBeenCalledWith('abc-123');
    expect(fixture.componentInstance.entry()?.ticker).toBe('BAC');
    expect(fixture.componentInstance.status()).toBe('CLOSED');
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

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    id: 'abc-123',
    statEntryId: 'stat-1',
    tradeDate: new Date(2026, 5, 4),
    ticker: 'BAC',
    pattern: 'GUS',
    direction: 'SHORT',
    executions: [{ seq: 0, kind: 'ENTRY', shares: 100, price: 5, executedAt: null }],
    size: 100,
    openPrice: 5,
    exitPrice: null,
    gainPercent: null,
    profitDollars: null,
    realProfitDollars: null,
    retainedProfitDollars: null,
    durationMinutes: null,
    note: null,
    errorNote: null,
    hasScreenshot: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
