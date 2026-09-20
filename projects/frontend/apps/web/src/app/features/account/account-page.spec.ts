import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AccountMovement,
  AccountSummary,
  Reconciliation,
  ReconciliationInput,
} from '../../core/api/account/account.model';
import { AccountRepository } from '../../core/api/account/account.repository';
import { ForexRepository } from '../../core/api/forex/forex.repository';
import { ConfirmService } from '../../core/app-state/confirm.service';
import { AccountPage } from './account-page';

/**
 * Pins the **morning reconciliation** block of the account page (#198) — the one place in the app
 * where a figure typed by hand moves the balance, so the regressions here cost money :
 *
 * - the **gap is live** : broker balance minus the app's, recomputed on every keystroke ;
 * - a gap goes through the **confirmation modal** (it creates a `Correction` line), a clean morning
 *   does not (it only timestamps itself) ;
 * - **cancelling** the modal reaches no endpoint ;
 * - a settled morning is **recognised as today's**, so the page can say so ;
 * - the input is **cleared** on success, so the next keystroke starts from the new balance.
 */
describe('AccountPage — morning reconciliation', () => {
  let reconcile: ReturnType<typeof vi.fn>;
  let reconciliations: ReturnType<typeof vi.fn>;
  let confirmed: boolean;
  let confirmAsk: ReturnType<typeof vi.fn>;
  /** What the history endpoint answers — set by a test **before** `setup()`. */
  let historyRows: Reconciliation[];

  beforeEach(() => {
    confirmed = true;
    reconcile = vi.fn((input: ReconciliationInput) =>
      of(
        makeReconciliation({ brokerBalance: input.brokerBalance, gap: input.brokerBalance - 1000 }),
      ),
    );
    historyRows = [];
    reconciliations = vi.fn(() => of(historyRows));
    confirmAsk = vi.fn(() => of(confirmed));

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: AccountRepository,
          useValue: {
            findMovements: () =>
              of({
                content: [] as AccountMovement[],
                pageIndex: 0,
                pageSize: 25,
                totalElements: 0,
                totalPages: 1,
              }),
            getSummary: (): Observable<AccountSummary> => of(makeSummary()),
            getBalanceSeries: () => of([]),
            addMovement: () => of({} as AccountMovement),
            updateMovement: () => of({} as AccountMovement),
            deleteMovement: () => of(undefined),
            reconcile,
            reconciliations,
          } as unknown as AccountRepository,
        },
        { provide: ForexRepository, useValue: { latestRate: () => throwError(() => new Error()) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: confirmAsk } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(undefined) }) } },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function setup(): AccountPage {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('shows no gap until a broker balance is typed, then computes it live', () => {
    const page = setup();

    expect(page.reconciliationGap()).toBeNull();

    page.setBrokerBalance(987.6);
    expect(page.reconciliationGap()).toBeCloseTo(-12.4, 2);

    page.setBrokerBalance(1000);
    expect(page.reconciliationGap()).toBe(0);
  });

  it('a clean morning is settled without a confirmation — nothing is created', () => {
    const page = setup();

    page.setBrokerBalance(1000);
    page.reconcile();

    expect(confirmAsk).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect((reconcile.mock.calls[0][0] as ReconciliationInput).brokerBalance).toBe(1000);
  });

  it('a gap asks for confirmation before creating the correction', () => {
    const page = setup();

    page.setBrokerBalance(987.6);
    page.reconcile();

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmCorrection',
      expect.objectContaining({ params: { gap: '-12.40' } }),
    );
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirmation never reaches the repository', () => {
    confirmed = false;
    const page = setup();

    page.setBrokerBalance(987.6);
    page.reconcile();

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('clears the typed balance once the morning is settled', () => {
    const page = setup();

    page.setBrokerBalance(1000);
    page.reconcile();

    expect(page.brokerBalance()).toBeNull();
    expect(page.reconciling()).toBe(false);
  });

  it('recognises this morning as already settled', () => {
    historyRows = [makeReconciliation({ valueDate: new Date() })];
    const page = setup();

    expect(page.todayReconciliation()).not.toBeNull();
  });

  it("yesterday's reconciliation doesn't count as this morning's", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    historyRows = [makeReconciliation({ valueDate: yesterday })];
    const page = setup();

    expect(page.todayReconciliation()).toBeNull();
  });
});

function makeSummary(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    balance: 1000,
    totalDeposits: 1000,
    totalWithdrawals: 0,
    netInjected: 1000,
    tradesPnl: 0,
    adjustments: 0,
    movementCount: 1,
    ...overrides,
  };
}

function makeReconciliation(overrides: Partial<Reconciliation> = {}): Reconciliation {
  return {
    id: 'reco-1',
    valueDate: new Date(2026, 8, 18),
    brokerBalance: 1000,
    appBalance: 1000,
    gap: 0,
    correctionId: null,
    reconciledAt: new Date(),
    ...overrides,
  };
}
