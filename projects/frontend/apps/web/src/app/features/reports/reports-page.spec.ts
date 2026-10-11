import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { startOfDay } from 'date-fns';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideNativeDateAdapter } from '@portfolioai/ui';
import {
  AccountMovementFilter,
  CashFlow,
  CashFlowBucket,
  CashFlowBucketSize,
} from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { selectPeriod } from '../../shared/period-preset/period-preset';
import { ReportsPage } from './reports-page';

/**
 * The « Flux du compte » page (#685, #696), against a stubbed repository :
 *
 *  - **The first load** asks the default : three months, by week, every type.
 *  - **The KPI row** reads the period's totals ; the balance tile is the whole account's, whatever
 *    the chips.
 *  - **« Trading seul »** narrows the request to trades + locates, empties « Apports nets », and is
 *    remembered in the browser for the next visit.
 *  - **The bar size** is disabled when wider than the period.
 *  - **A filter change keeps the previous chart** until the answer lands — no skeleton flash.
 *  - **An empty period** shows its empty state ; **a failed load** its banner, and « retry » asks
 *    again.
 */
function bucket(overrides: Partial<CashFlowBucket> = {}): CashFlowBucket {
  return {
    from: new Date(2026, 8, 14),
    to: new Date(2026, 8, 20),
    winningTrades: 0,
    losingTrades: 0,
    locates: 0,
    deposits: 0,
    withdrawals: 0,
    adjustments: 0,
    net: 0,
    ...overrides,
  };
}

/** Two weeks of September : a deposit week, then a trading week. */
function makeFlow(overrides: Partial<CashFlow> = {}): CashFlow {
  return {
    dateFrom: new Date(2026, 8, 7),
    dateTo: new Date(2026, 8, 20),
    openingBalance: 23121.7,
    closingBalance: 24481.7,
    buckets: [
      bucket({ from: new Date(2026, 8, 7), deposits: 1000, net: 1000 }),
      bucket({ winningTrades: 312, losingTrades: -405, locates: -262, withdrawals: 0, net: -355 }),
    ],
    ...overrides,
  };
}

describe('ReportsPage', () => {
  let getCashFlow: ReturnType<
    typeof vi.fn<
      (filter: AccountMovementFilter, groupBy: CashFlowBucketSize) => Observable<CashFlow>
    >
  >;

  beforeEach(() => {
    localStorage.clear();
    getCashFlow = vi.fn(() => of(makeFlow()));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        provideNativeDateAdapter(),
        { provide: AccountRepository, useValue: { getCashFlow } },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  async function render(): Promise<ComponentFixture<ReportsPage>> {
    const fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<ReportsPage>, testId: string): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`)
        ?.textContent ?? ''
    );
  }

  it('first asks for the last three months by week, every type', async () => {
    await render();

    const [filter, groupBy] = getCashFlow.mock.calls[0];
    expect(groupBy).toBe('WEEK');
    expect(filter.types).toEqual(['TRADE', 'LOCATE', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT']);
    expect(filter.dateFrom).not.toBeNull();
  });

  // #703 : « Ce trimestre » asked up to the 31st of December, and dated the balance there.
  it('never asks past today for a current-period preset', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.setSelection(selectPeriod('thisQuarter', page.selection()));
    await fixture.whenStable();

    const dateTo = getCashFlow.mock.lastCall?.[0].dateTo;
    expect(dateTo?.getTime()).toBeLessThanOrEqual(startOfDay(new Date()).getTime());
  });

  it('sums the period in the KPI row, trades and locates in the trading result', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    expect(page.totals().net).toBe(645);
    expect(page.tradingResult()).toBe(-355);
    expect(text(fixture, 'kpi-balance')).toContain('24,481.70');
  });

  it('narrows to trades and locates with « Trading seul », and remembers it', async () => {
    const fixture = await render();

    fixture.componentInstance.toggleTradingOnly();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getCashFlow.mock.lastCall?.[0].types).toEqual(['TRADE', 'LOCATE']);
    expect(text(fixture, 'kpi-injected')).toContain('—');
    expect(JSON.parse(localStorage.getItem('reports.cashFlow.types') ?? '[]')).toEqual([
      'TRADE',
      'LOCATE',
    ]);
  });

  it('opens on the chips last chosen', async () => {
    localStorage.setItem('reports.cashFlow.types', JSON.stringify(['TRADE', 'LOCATE']));

    const fixture = await render();

    expect(fixture.componentInstance.tradingOnly()).toBe(true);
    expect(getCashFlow.mock.calls[0][0].types).toEqual(['TRADE', 'LOCATE']);
  });

  it('keeps at least one type when the last one is turned off', async () => {
    const fixture = await render();

    fixture.componentInstance.setTypes([]);

    expect(fixture.componentInstance.types().length).toBe(5);
  });

  it('disables a bar size wider than the period', async () => {
    const fixture = await render();

    expect(fixture.componentInstance.sizeAllowed('YEAR')).toBe(false);
    expect(fixture.componentInstance.sizeAllowed('WEEK')).toBe(true);
  });

  // #701 review : before the yearly answer, « Jour » could reach the 400-bar refusal.
  it('disables every bar size on all time until the history length is known', async () => {
    const history = new Subject<CashFlow>();
    getCashFlow.mockImplementation((_filter, groupBy) =>
      groupBy === 'YEAR' ? history : of(makeFlow()),
    );
    const fixture = await render();
    const page = fixture.componentInstance;

    page.showAllTime();
    fixture.detectChanges();
    expect(page.sizeAllowed('DAY')).toBe(false);
    expect(page.sizeAllowed('MONTH')).toBe(false);

    history.next(makeFlow({ dateFrom: new Date(2024, 0, 2), dateTo: new Date(2026, 8, 20) }));
    history.complete();
    await fixture.whenStable();
    expect(page.sizeAllowed('MONTH')).toBe(true);
    expect(page.sizeAllowed('DAY')).toBe(false);
  });

  // A size picked by hand outlives a period change : « Trimestre » on 3 months stays on 6.
  it('keeps the size picked by hand when the period changes', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.chosenSize.set('QUARTER');
    page.setSelection(selectPeriod('last6Months', page.selection()));

    expect(page.bucketSize()).toBe('QUARTER');
  });

  it('shows the nearest size that fits, and the hand-picked one again once it fits', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.chosenSize.set('QUARTER');
    page.setSelection(selectPeriod('thisMonth', page.selection()));
    expect(page.bucketSize()).not.toBe('QUARTER');

    page.setSelection(selectPeriod('last6Months', page.selection()));
    expect(page.bucketSize()).toBe('QUARTER');
  });

  it('follows the period while no size was picked', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.setSelection(selectPeriod('thisYear', page.selection()));

    expect(page.bucketSize()).toBe('MONTH');
  });

  it('keeps the previous chart on screen while a new filter loads', async () => {
    const fixture = await render();
    const answer = new Subject<CashFlow>();
    getCashFlow.mockReturnValue(answer);

    fixture.componentInstance.chosenSize.set('MONTH');
    fixture.detectChanges();

    expect(fixture.componentInstance.flow()?.buckets.length).toBe(2);
    expect(fixture.nativeElement.querySelector('ui-bar-chart')).not.toBeNull();
  });

  it('shows the empty state for a period where nothing moved', async () => {
    getCashFlow.mockReturnValue(of(makeFlow({ buckets: [bucket(), bucket()] })));

    const fixture = await render();

    expect(fixture.nativeElement.querySelector('[data-testid="reports-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ui-bar-chart')).toBeNull();
  });

  it('says the load failed, and asks again on retry', async () => {
    getCashFlow.mockReturnValue(throwError(() => new Error('503')));
    const fixture = await render();
    expect(fixture.nativeElement.querySelector('.error-banner')).not.toBeNull();

    getCashFlow.mockReturnValue(of(makeFlow()));
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-banner')).toBeNull();
  });
});
