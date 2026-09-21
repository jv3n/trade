import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AccountMovement,
  AccountMovementFilter,
  AccountSummary,
} from '../../core/api/account/account.model';
import { AccountRepository, PagedResult } from '../../core/api/account/account.repository';
import { ForexRepository } from '../../core/api/forex/forex.repository';
import { BalanceCurrencyService } from '../../core/app-state/balance-currency.service';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { AccountPage } from './account-page';

/**
 * Pins the listing behaviour of [AccountPage] after the #229 redesign — what a typecheck can't
 * catch :
 *
 *  - **One filter drives the whole page** — the period and type controls feed `/movements` **and**
 *    `/summary` with the same window. A KPI row describing a different slice than the table under
 *    it would be worse than no KPI at all.
 *  - **Presets travel as dates** — `thisMonth` and friends are a UI vocabulary ; only `dateFrom` /
 *    `dateTo` reach the repository, exactly like the journal's filter.
 *  - **A filter change rewinds to page 0** — page 4 of the previous result set means nothing.
 *  - **The balance column is the server's** — `balanceAfter` is rendered as received, never
 *    recomputed from the visible rows, or filtering to trades would renumber it.
 *
 * Creation and edition go through `MovementDialog` and are its concern, not the page's.
 */
describe('AccountPage', () => {
  let findMovements: ReturnType<typeof vi.fn>;
  let getSummary: ReturnType<typeof vi.fn>;
  let page: PagedResult<AccountMovement>;

  beforeEach(async () => {
    page = makePage([]);
    findMovements = vi.fn((_filter?: AccountMovementFilter) => of(page));
    getSummary = vi.fn((_filter?: AccountMovementFilter) => of(makeSummary()));

    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        // The « custom » preset reveals two `<mat-datepicker>` widgets, whose input reaches for a
        // `DateAdapter` at construction time.
        provideNativeDateAdapter(),
        {
          provide: AccountRepository,
          useValue: {
            findMovements,
            getSummary,
            getBalanceSeries: () => of([]),
            addMovement: () => of({} as unknown),
            updateMovement: () => of({} as unknown),
            deleteMovement: () => of(undefined),
            reconcile: () => of({} as unknown),
            reconciliations: () => of([]),
          } as unknown as AccountRepository,
        },
        { provide: ForexRepository, useValue: { latestRate: () => of(null) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        // Stubbed rather than provided for real : it reaches the user preferences through
        // AuthService → AuthRepository, and the display currency is not what these tests pin.
        {
          provide: BalanceCurrencyService,
          useValue: {
            supported: ['USD', 'CAD'] as const,
            currency: signal('USD' as const),
            set: vi.fn(),
          },
        },
        { provide: ConfirmService, useValue: { ask: () => of(true) } },
      ],
    }).compileComponents();
  });

  it('opens on the running month and asks the listing and the summary for that same window', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    const listed = findMovements.mock.calls[0][0] as AccountMovementFilter;
    const summarised = getSummary.mock.calls[0][0] as AccountMovementFilter;

    expect(listed.dateFrom).toBeInstanceOf(Date);
    expect(listed.dateFrom?.getMonth()).toBe(new Date().getMonth());
    expect(summarised.dateFrom?.getTime()).toBe(listed.dateFrom?.getTime());
    expect(summarised.dateTo?.getTime()).toBe(listed.dateTo?.getTime());
  });

  it('sends only resolved dates — a preset name never reaches the repository', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    const sent = findMovements.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['dateFrom', 'dateTo', 'types']);
    expect(sent['period']).toBeUndefined();
  });

  it('expands the « deposits / withdrawals » choice into the two movement types', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    findMovements.mockClear();

    fixture.componentInstance.onTypeChange('cash');

    const sent = findMovements.mock.calls[0][0] as AccountMovementFilter;
    expect(sent.types).toEqual(['DEPOSIT', 'WITHDRAWAL']);
  });

  it('asks for every type when the filter is « all »', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    const sent = findMovements.mock.calls[0][0] as AccountMovementFilter;
    expect(sent.types).toBeNull();
  });

  it('rewinds to the first page when the filter changes', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    fixture.componentInstance.onPage({ pageIndex: 3, pageSize: 25, length: 200 });
    expect(fixture.componentInstance.pageIndex()).toBe(3);

    fixture.componentInstance.onTypeChange('trades');

    expect(fixture.componentInstance.pageIndex()).toBe(0);
  });

  it('applies a custom range picked in the period filter', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    const from = new Date(2026, 8, 1);
    const to = new Date(2026, 8, 18);

    fixture.componentInstance.setPeriod({ period: 'custom', dateFrom: from, dateTo: to });

    const f = fixture.componentInstance.appliedFilter();
    expect(f.period).toBe('custom');
    expect(f.dateFrom).toEqual(from);
    expect(f.dateTo).toEqual(to);
  });

  /**
   * The acceptance criterion of #229, seen from the front : the balance shown is the one the server
   * computed over the whole history. Here the withdrawal between the two trades is filtered out,
   * and the rendered balances must still be the server's 1041.85 / 1291.85.
   */
  it('renders the balance the server sent rather than recomputing it from the visible rows', () => {
    page = makePage([
      makeMovement({ id: 'b', amount: 150, balanceAfter: 1041.85, type: 'TRADE' }),
      makeMovement({ id: 'a', amount: 291.85, balanceAfter: 1291.85, type: 'TRADE' }),
    ]);
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    const balances = fixture.componentInstance.movements().map((m) => m.balanceAfter);
    expect(balances).toEqual([1041.85, 1291.85]);
  });

  // ---------------------------------------------------------------------------
  // Factories — each test overrides only the field it is about.
  // ---------------------------------------------------------------------------

  function makeMovement(overrides: Partial<AccountMovement> = {}): AccountMovement {
    return {
      id: 'm1',
      type: 'DEPOSIT',
      amount: 1000,
      valueDate: new Date(2026, 8, 15),
      note: 'Wealthsimple transfer',
      balanceAfter: 1000,
      tradeEntryId: null,
      tradeDirection: null,
      tradeSize: null,
      createdAt: new Date(2026, 8, 15),
      updatedAt: new Date(2026, 8, 15),
      ...overrides,
    };
  }

  function makePage(content: AccountMovement[]): PagedResult<AccountMovement> {
    return {
      content,
      pageIndex: 0,
      pageSize: 25,
      totalElements: content.length,
      totalPages: 1,
    };
  }

  function makeSummary(overrides: Partial<AccountSummary> = {}): AccountSummary {
    return {
      balance: 27359.95,
      periodPnl: 751.85,
      periodTradeCount: 8,
      periodWinningTradeCount: 6,
      periodDeposits: 1000,
      periodWithdrawals: -500,
      periodNetInjected: 500,
      periodAdjustments: 0,
      periodMovementCount: 10,
      ...overrides,
    };
  }
});
