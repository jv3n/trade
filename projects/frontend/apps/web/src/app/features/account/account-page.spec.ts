import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MatDialog, provideNativeDateAdapter, StbToast } from '@portfolioai/ui';
import {
  AccountMovement,
  AccountMovementFilter,
  AccountSummary,
} from '../../core/api/account/account.model';
import { AccountRepository, PagedResult } from '../../core/api/account/account.repository';
import { ForexRepository } from '../../core/api/forex/forex.repository';
import { BalanceCurrencyService } from '../../core/app-state/balance-currency.service';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { computePeriodRange } from '../../shared/period-preset/period-preset';
import { AccountPage } from './account-page';

/**
 * Pins the listing behaviour of [AccountPage] after the #229 redesign — what a typecheck can't
 * catch :
 *
 *  - **The period drives the page, the type only the table** (#488) — the period feeds `/movements`
 *    **and** `/summary` with the same window ; the type filter narrows the table and never the KPI
 *    tiles, which describe the period rather than the rows picked under them.
 *  - **Presets travel as dates** — `thisMonth` and friends are a UI vocabulary ; only `dateFrom` /
 *    `dateTo` reach the repository, exactly like the journal's filter.
 *  - **The table opens on trades** (#473) — the rows the page is opened for ; the KPI row is not
 *    narrowed by that default.
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
        { provide: StbToast, useValue: { success: vi.fn(), error: vi.fn() } },
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

  it('opens on the trades, the rows the page is opened for', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    const sent = findMovements.mock.calls[0][0] as AccountMovementFilter;
    expect(fixture.componentInstance.appliedFilter().type).toBe('trades');
    expect(sent.types).toEqual(['TRADE']);
  });

  it('asks for every type when the filter is « all »', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    findMovements.mockClear();

    fixture.componentInstance.onTypeChange('all');

    const sent = findMovements.mock.calls[0][0] as AccountMovementFilter;
    expect(sent.types).toBeNull();
  });

  it('rewinds to the first page when the filter changes', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    fixture.componentInstance.onPage({ pageIndex: 3, pageSize: 25, length: 200 });
    expect(fixture.componentInstance.pageIndex()).toBe(3);

    fixture.componentInstance.onTypeChange('cash');

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

  /**
   * #488 : the tiles describe the period, not the table's rows. Fed by the type filter, the page
   * opened on « Apports nets 0,00 » under the default « Trades » — September held −850 of cash.
   */
  describe('type filter', () => {
    it('narrows the table only : the tiles keep the whole period', () => {
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();
      getSummary.mockClear();
      findMovements.mockClear();

      fixture.componentInstance.onTypeChange('cash');

      expect(getSummary).not.toHaveBeenCalled();
      expect((findMovements.mock.calls[0][0] as AccountMovementFilter).types).toEqual([
        'DEPOSIT',
        'WITHDRAWAL',
      ]);
    });

    it('keeps the net injected of the period under the default « Trades »', () => {
      getSummary.mockImplementation((f?: AccountMovementFilter) =>
        of(
          f?.types
            ? makeSummary({ periodNetInjected: 0 })
            : makeSummary({ periodNetInjected: -850 }),
        ),
      );
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.appliedFilter().type).toBe('trades');
      expect(fixture.componentInstance.summary()?.periodNetInjected).toBe(-850);
    });
  });

  describe('reconciliation-gap tile', () => {
    // October in the issue : $3,000 of P&L, $200 of corrections the broker took.
    it("reads the period's corrections unsigned, and their share of the P&L", () => {
      getSummary.mockReturnValue(
        of(makeSummary({ periodPnl: 3000, periodReconciliationGap: -200 })),
      );
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      const gap = fixture.componentInstance.reconciliationGap();
      expect(gap?.amount).toBe(200);
      expect(gap?.credit).toBe(false);
      expect(gap?.share).toBeCloseTo(6.67, 2);
      expect(
        fixture.nativeElement.querySelector('[data-testid="reconciliation-gap"]'),
      ).not.toBeNull();
    });

    it('reads a period without any correction as 0 and 0 %', () => {
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.reconciliationGap()).toEqual({
        amount: 0,
        credit: false,
        share: 0,
      });
    });

    it('keeps the amount but drops the ratio on a losing period', () => {
      getSummary.mockReturnValue(
        of(makeSummary({ periodPnl: -420, periodReconciliationGap: -35 })),
      );
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      const gap = fixture.componentInstance.reconciliationGap();
      expect(gap?.amount).toBe(35);
      expect(gap?.share).toBeNull();
    });

    // A credited-back locate can leave the period's corrections net positive.
    it('reads a net positive period as a credit, without a negative percentage', () => {
      getSummary.mockReturnValue(of(makeSummary({ periodReconciliationGap: 5 })));
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.reconciliationGap()).toEqual({
        amount: 5,
        credit: true,
        share: null,
      });
    });

    // #480 : no reconciled morning in the period means nothing was measured — no plausible 0.
    it('hides the tile when no morning was reconciled in the period', () => {
      getSummary.mockReturnValue(of(makeSummary({ periodReconciliationGap: null })));
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.reconciliationGap()).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="reconciliation-gap"]')).toBeNull();
    });

    // #480 : the corrections can hold a later fix absorbed into them ; the tile must not read it.
    it("reads the mornings' recorded gap, not the corrections' current amount", () => {
      getSummary.mockReturnValue(
        of(
          makeSummary({ periodPnl: 3000, periodAdjustments: -201, periodReconciliationGap: -200 }),
        ),
      );
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.reconciliationGap()?.amount).toBe(200);
    });

    it('asks the summary once per load, over the dates only', () => {
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(getSummary).toHaveBeenCalledTimes(1);
      expect((getSummary.mock.calls[0][0] as AccountMovementFilter).types).toBeNull();
    });

    // A period moved quickly used to let an older answer overwrite a newer one.
    it('drops the answer of a superseded period when it lands after the current one', () => {
      const superseded = new Subject<AccountSummary>();
      let calls = 0;
      getSummary.mockImplementation(() => {
        calls++;
        if (calls === 2) return superseded;
        return of(makeSummary({ periodReconciliationGap: calls === 3 ? -80 : 0 }));
      });
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      fixture.componentInstance.setPeriod({
        period: 'lastMonth',
        ...computePeriodRange('lastMonth'),
      });
      fixture.componentInstance.setPeriod({
        period: 'thisMonth',
        ...computePeriodRange('thisMonth'),
      });
      superseded.next(makeSummary({ periodReconciliationGap: -999 }));

      expect(superseded.observed).toBe(false);
      expect(fixture.componentInstance.reconciliationGap()?.amount).toBe(80);
    });

    it('flags the page when the summary fails', () => {
      getSummary.mockReturnValue(throwError(() => new Error('503')));
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      expect(fixture.componentInstance.error()).not.toBeNull();
    });

    it('reads a dash, not « — % of the P&L », when the period made no profit', () => {
      getSummary.mockReturnValue(of(makeSummary({ periodPnl: 0, periodReconciliationGap: -12.4 })));
      TestBed.inject(TranslateService).setTranslation('en', {
        account: {
          kpi: {
            reconciliationGapShare: '{{share}} % of the P&L',
            reconciliationGapNoShare: '— · flat or losing P&L',
          },
        },
      });
      const fixture = TestBed.createComponent(AccountPage);
      fixture.detectChanges();

      const sub = fixture.nativeElement.querySelector(
        '[data-testid="reconciliation-gap"] .kpi__sub',
      );
      expect(sub.textContent.trim()).toBe('— · flat or losing P&L');
    });
  });

  // ---------------------------------------------------------------------------
  // Factories — each test overrides only the field it is about.
  // ---------------------------------------------------------------------------

  /**
   * #477 : a morning's correction can absorb a later fix to an earlier row (#476), and a row whose
   * amount rewrote itself has to say so. The mark is keyed on the gap its morning measured — never
   * on the row type alone, so an untouched correction looks exactly as before.
   */
  describe('adjusted correction', () => {
    function renderRows(movements: AccountMovement[]): HTMLElement {
      page = makePage(movements);
      const fixture = TestBed.createComponent(AccountPage);
      fixture.componentInstance.onTypeChange('all');
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('marks a correction whose amount moved away from what its morning measured', () => {
      const el = renderRows([
        makeMovement({ type: 'ADJUSTMENT', amount: -12.4, measuredGap: -15.4, note: null }),
      ]);

      expect(el.querySelector('[data-testid="adjusted-correction"]')).not.toBeNull();
    });

    it('leaves a correction that still matches its morning unmarked', () => {
      const el = renderRows([
        makeMovement({ type: 'ADJUSTMENT', amount: -12.4, measuredGap: -12.4, note: null }),
      ]);

      expect(el.querySelector('[data-testid="adjusted-correction"]')).toBeNull();
    });

    // Float noise off the wire (0.1 + 0.2) must not read as an adjustment.
    it('compares in cents, not in raw floats', () => {
      const cmp = TestBed.createComponent(AccountPage).componentInstance;

      expect(
        cmp.isAdjusted(makeMovement({ type: 'ADJUSTMENT', amount: 0.1 + 0.2, measuredGap: 0.3 })),
      ).toBe(false);
    });

    it('never marks a movement that has no morning behind it', () => {
      const cmp = TestBed.createComponent(AccountPage).componentInstance;

      expect(cmp.isAdjusted(makeMovement({ type: 'ADJUSTMENT', amount: -50 }))).toBe(false);
      expect(cmp.isAdjusted(makeMovement({ type: 'DEPOSIT', amount: 1000 }))).toBe(false);
    });

    // A backend serialising without nulls would drop the field : undefined must not tag every row.
    it('reads an absent measured gap as no morning, not as an adjustment', () => {
      const cmp = TestBed.createComponent(AccountPage).componentInstance;
      const withoutField = makeMovement({ type: 'DEPOSIT', amount: 1000 });
      delete (withoutField as Partial<AccountMovement>).measuredGap;

      expect(cmp.isAdjusted(withoutField)).toBe(false);
      expect(cmp.isMorningCorrection(withoutField)).toBe(false);
    });

    it('names a morning correction without a note after its morning, not with a dash', () => {
      const el = renderRows([
        makeMovement({ type: 'ADJUSTMENT', amount: -12.4, measuredGap: -12.4, note: null }),
      ]);

      expect(el.textContent).toContain('account.morningCorrection');
    });
  });

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
      measuredGap: null,
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
      periodReconciliationGap: 0,
      periodMovementCount: 10,
      ...overrides,
    };
  }
});
