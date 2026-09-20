import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Reconciliation, ReconciliationInput } from '../../../core/api/account/account.model';
import { AccountRepository } from '../../../core/api/account/account.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { MorningReconciliation } from './morning-reconciliation';

/**
 * Pins the morning block (#198) — the one flow in the app where a figure typed by hand moves the
 * balance, hosted both by the account page and by step 1 of the Today page. The regressions here
 * cost money :
 *
 * - the **gap is live** : broker balance minus the app's, recomputed on every keystroke ;
 * - a gap goes through the **confirmation modal** (it creates a `Correction` line), a clean morning
 *   does not (it only timestamps itself) ;
 * - **cancelling** the modal reaches no endpoint ;
 * - the host is **told** once the morning is settled, and the input is cleared so the next
 *   keystroke starts from the new balance ;
 * - a settled morning is **recognised as today's** — and yesterday's is not ;
 * - **cancelling a morning** (#249) always confirms, erases it, and tells the host — a figure typed
 *   by mistake must leave no trace, where re-posting the day only corrects it.
 */
describe('MorningReconciliation', () => {
  let reconcile: ReturnType<typeof vi.fn>;
  let cancelReconciliation: ReturnType<typeof vi.fn>;
  let confirmed: boolean;
  let confirmAsk: ReturnType<typeof vi.fn>;
  /** What the history endpoint answers — set by a test **before** `setup()`. */
  let historyRows: Reconciliation[];

  beforeEach(() => {
    confirmed = true;
    historyRows = [];
    reconcile = vi.fn((input: ReconciliationInput) =>
      of(
        makeReconciliation({
          brokerBalance: input.brokerBalance,
          gap: input.brokerBalance - 1000,
          correctionId: input.brokerBalance === 1000 ? null : 'mv-9',
        }),
      ),
    );
    cancelReconciliation = vi.fn(() => of(undefined));
    confirmAsk = vi.fn(() => of(confirmed));

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        {
          provide: AccountRepository,
          useValue: {
            reconcile,
            reconciliations: vi.fn(() => of(historyRows)),
            cancelReconciliation,
          } as unknown as AccountRepository,
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: confirmAsk } },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  /** Mounts the block with the app balance its host would pass (1 000 $ unless told otherwise). */
  function setup(appBalance: number | null = 1000): ComponentFixture<MorningReconciliation> {
    const fixture = TestBed.createComponent(MorningReconciliation);
    fixture.componentRef.setInput('appBalance', appBalance);
    fixture.detectChanges();
    return fixture;
  }

  it('shows no gap until a broker balance is typed, then computes it live', () => {
    const page = setup().componentInstance;

    expect(page.gap()).toBeNull();

    page.setBrokerBalance(987.6);
    expect(page.gap()).toBeCloseTo(-12.4, 2);

    page.setBrokerBalance(1000);
    expect(page.gap()).toBe(0);
  });

  it('waits for the host balance before computing anything', () => {
    const page = setup(null).componentInstance;

    page.setBrokerBalance(987.6);

    expect(page.gap()).toBeNull();
  });

  it('a clean morning is settled without a confirmation — nothing is created', () => {
    const page = setup().componentInstance;

    page.setBrokerBalance(1000);
    page.submit();

    expect(confirmAsk).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect((reconcile.mock.calls[0][0] as ReconciliationInput).brokerBalance).toBe(1000);
  });

  it('a gap asks for confirmation before creating the correction', () => {
    const page = setup().componentInstance;

    page.setBrokerBalance(987.6);
    page.submit();

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmCorrection',
      expect.objectContaining({ params: { gap: '-12.40' } }),
    );
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirmation never reaches the repository', () => {
    confirmed = false;
    const page = setup().componentInstance;

    page.setBrokerBalance(987.6);
    page.submit();

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('tells the host and clears the input once the morning is settled', () => {
    const fixture = setup();
    const page = fixture.componentInstance;
    const settled = vi.fn();
    page.settled.subscribe(settled);

    page.setBrokerBalance(1000);
    page.submit();

    expect(settled).toHaveBeenCalledTimes(1);
    expect(page.brokerBalance()).toBeNull();
    expect(page.submitting()).toBe(false);
  });

  it('recognises this morning as already settled', () => {
    historyRows = [makeReconciliation({ valueDate: new Date() })];

    expect(setup().componentInstance.today()).not.toBeNull();
  });

  it("yesterday's reconciliation doesn't count as this morning's", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    historyRows = [makeReconciliation({ valueDate: yesterday })];

    expect(setup().componentInstance.today()).toBeNull();
  });
  // ---------------------------------------------------------------------------
  // Cancelling a morning (#249)
  // ---------------------------------------------------------------------------

  it('always confirms before cancelling, even a clean morning', () => {
    const today = makeReconciliation({ gap: 0, correctionId: null });
    historyRows = [today];
    const page = setup().componentInstance;

    page.cancel(today);

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmCancel',
      expect.objectContaining({ variant: 'danger' }),
    );
    expect(cancelReconciliation).toHaveBeenCalledWith(today.id);
  });

  it('reaches no endpoint when the confirmation is declined', () => {
    const today = makeReconciliation();
    historyRows = [today];
    confirmed = false;
    const page = setup().componentInstance;

    page.cancel(today);

    expect(cancelReconciliation).not.toHaveBeenCalled();
  });

  /** The correction that just went moved the balance — the host has to refetch. */
  it('tells the host once the morning is cancelled', () => {
    const today = makeReconciliation();
    historyRows = [today];
    const fixture = setup();
    const settled = vi.fn();
    fixture.componentInstance.settled.subscribe(settled);

    fixture.componentInstance.cancel(today);

    expect(settled).toHaveBeenCalledWith(today);
  });

  it('clears the in-flight flag when the cancellation fails', () => {
    const today = makeReconciliation();
    historyRows = [today];
    cancelReconciliation.mockReturnValue(throwError(() => new Error('boom')));
    const page = setup().componentInstance;

    page.cancel(today);

    expect(page.cancelling()).toBe(false);
  });
});

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
