import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast } from '@portfolioai/ui';
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
 * - **« Aucun écart »** (#407) reconciles at the app's own balance in one click, unconfirmed ;
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
  /** What the history endpoint answers — set by a test **before** `await setup()`. */
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
        { provide: StbToast, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: confirmAsk } },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  /** Mounts the block with the app balance its host would pass (1 000 $ unless told otherwise). */
  async function setup(
    appBalance: number | null = 1000,
  ): Promise<ComponentFixture<MorningReconciliation>> {
    const fixture = TestBed.createComponent(MorningReconciliation);
    fixture.componentRef.setInput('appBalance', appBalance);
    await settle(fixture);
    return fixture;
  }

  /** The history loads through a resource (#672) : it answers a tick after the call. */
  async function settle(fixture: ComponentFixture<MorningReconciliation>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows no gap until a broker balance is typed, then computes it live', async () => {
    const page = (await setup()).componentInstance;

    expect(page.gap()).toBeNull();

    page.setBrokerBalance(987.6);
    expect(page.gap()).toBeCloseTo(-12.4, 2);

    page.setBrokerBalance(1000);
    expect(page.gap()).toBe(0);
  });

  it('says why it waits when the host could not load the balance', async () => {
    const fixture = TestBed.createComponent(MorningReconciliation);
    fixture.componentRef.setInput('appBalance', null);
    fixture.componentRef.setInput('balanceUnavailable', true);
    await settle(fixture);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="balance-unavailable"]')).not.toBeNull();
    expect(el.textContent).not.toContain('account.reconciliation.note');
  });

  it('waits for the host balance before computing anything', async () => {
    const page = (await setup(null)).componentInstance;

    page.setBrokerBalance(987.6);

    expect(page.gap()).toBeNull();
  });

  it('a clean morning is settled without a confirmation — nothing is created', async () => {
    const page = (await setup()).componentInstance;

    page.setBrokerBalance(1000);
    page.submit();

    expect(confirmAsk).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect((reconcile.mock.calls[0][0] as ReconciliationInput).brokerBalance).toBe(1000);
  });

  it('« Aucun écart » reconciles at the computed balance without asking', async () => {
    const page = (await setup()).componentInstance;

    page.reconcileNoGap();

    expect(confirmAsk).not.toHaveBeenCalled();
    expect((reconcile.mock.calls[0][0] as ReconciliationInput).brokerBalance).toBe(1000);
  });

  it('« Aucun écart » sends nothing while the app balance has not landed', async () => {
    const page = (await setup(null)).componentInstance;

    page.reconcileNoGap();

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('a gap asks for confirmation before creating the correction', async () => {
    const page = (await setup()).componentInstance;

    page.setBrokerBalance(987.6);
    page.submit();

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmCorrection',
      expect.objectContaining({ params: { gap: '-12.40', balance: '1,000.00' } }),
    );
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  // Typed on staging : -999999999 gave a gap of -1,000,045,754 $ and the button stayed enabled.
  it('refuses a negative broker balance — no gap, no call, button blocked', async () => {
    const component = (await setup(1000)).componentInstance;

    component.setBrokerBalance(-999999999);

    expect(component.negativeBalance()).toBe(true);
    component.submit();
    expect(confirmAsk).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('warns before writing a gap past a fifth of the computed balance', async () => {
    const component = (await setup(1000)).componentInstance;

    component.setBrokerBalance(1300);

    // Read before submitting : a settled morning clears the input, and with it the gap.
    expect(component.unusualGap()).toBe(true);
    component.submit();

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmUnusualCorrection',
      expect.objectContaining({ variant: 'danger' }),
    );
    expect(reconcile).toHaveBeenCalled();
  });

  it('an ordinary gap keeps the plain confirmation', async () => {
    const component = (await setup(1000)).componentInstance;

    component.setBrokerBalance(1050);

    expect(component.unusualGap()).toBe(false);
    component.submit();

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmCorrection',
      expect.objectContaining({ variant: undefined }),
    );
  });

  // The Today page mounts the block before its summary lands : on a cold start that window is
  // seconds long, and a submit then slipped past the confirmation entirely (#307).
  it('sends nothing while the app balance has not landed', async () => {
    const component = (await setup(null)).componentInstance;

    component.setBrokerBalance(1300);
    component.submit();

    expect(confirmAsk).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation never reaches the repository', async () => {
    confirmed = false;
    const page = (await setup()).componentInstance;

    page.setBrokerBalance(987.6);
    page.submit();

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('tells the host and clears the input once the morning is settled', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    const settled = vi.fn();
    page.settled.subscribe(settled);

    page.setBrokerBalance(1000);
    page.submit();

    expect(settled).toHaveBeenCalledTimes(1);
    expect(page.brokerBalance()).toBeNull();
    expect(page.submitting()).toBe(false);
  });

  it('recognises this morning as already settled', async () => {
    historyRows = [makeReconciliation({ valueDate: new Date() })];

    expect((await setup()).componentInstance.today()).not.toBeNull();
  });

  it("yesterday's reconciliation doesn't count as this morning's", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    historyRows = [makeReconciliation({ valueDate: yesterday })];

    expect((await setup()).componentInstance.today()).toBeNull();
  });
  // ---------------------------------------------------------------------------
  // Cancelling a morning (#249)
  // ---------------------------------------------------------------------------

  it('always confirms before cancelling, even a clean morning', async () => {
    const today = makeReconciliation({ gap: 0, correctionId: null });
    historyRows = [today];
    const page = (await setup()).componentInstance;

    page.cancel(today);

    expect(confirmAsk).toHaveBeenCalledWith(
      'account.reconciliation.confirmCancel',
      expect.objectContaining({ variant: 'danger' }),
    );
    expect(cancelReconciliation).toHaveBeenCalledWith(today.id);
  });

  it('reaches no endpoint when the confirmation is declined', async () => {
    const today = makeReconciliation();
    historyRows = [today];
    confirmed = false;
    const page = (await setup()).componentInstance;

    page.cancel(today);

    expect(cancelReconciliation).not.toHaveBeenCalled();
  });

  /** The correction that just went moved the balance — the host has to refetch. */
  it('tells the host once the morning is cancelled', async () => {
    const today = makeReconciliation();
    historyRows = [today];
    const fixture = await setup();
    const settled = vi.fn();
    fixture.componentInstance.settled.subscribe(settled);

    fixture.componentInstance.cancel(today);

    expect(settled).toHaveBeenCalledWith(today);
  });

  it('clears the in-flight flag when the cancellation fails', async () => {
    const today = makeReconciliation();
    historyRows = [today];
    cancelReconciliation.mockReturnValue(throwError(() => new Error('boom')));
    const page = (await setup()).componentInstance;

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
