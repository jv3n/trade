import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MatDialogRef, provideNativeDateAdapter } from '@portfolioai/ui';
import { addDays, startOfDay } from 'date-fns';
import { describe, expect, it, vi } from 'vitest';
import { NewTradeDialog } from './new-trade-dialog';

/**
 * Component spec for the « new trade » dialog of the journal (#634) — a trade with no stat behind
 * it, the one an import or a session typed after the fact needs :
 *
 * - **Saves only with a ticker, and never on a future day** — the backend refuses both, the dialog
 *   does not offer them.
 * - **Defaults to a GUS short today** — the pattern and the direction the user trades.
 * - **Closes with the trade to save**, its ticker upper-cased ; cancelling closes with nothing.
 */
function setup() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [NewTradeDialog],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(NewTradeDialog);
  fixture.detectChanges();
  return { dialog: fixture.componentInstance, close };
}

describe('NewTradeDialog', () => {
  it('waits for a ticker before saving', () => {
    const { dialog } = setup();
    expect(dialog.canSave()).toBe(false);

    dialog.textForm.ticker().value.set('SGBX');

    expect(dialog.canSave()).toBe(true);
  });

  it('refuses a day in the future', () => {
    const { dialog } = setup();
    dialog.textForm.ticker().value.set('SGBX');

    dialog.setDate(addDays(new Date(), 1));

    expect(dialog.canSave()).toBe(false);
  });

  it('closes with a GUS short of today by default, its ticker upper-cased', () => {
    const { dialog, close } = setup();
    dialog.textForm.ticker().value.set(' sgbx ');

    dialog.submit();

    expect(close).toHaveBeenCalledWith({
      tradeDate: startOfDay(new Date()),
      ticker: 'SGBX',
      pattern: 'GUS',
      direction: 'SHORT',
    });
  });

  it('keeps the day, the pattern and the direction picked', () => {
    const { dialog, close } = setup();
    dialog.textForm.ticker().value.set('KTTA');
    dialog.setDate(new Date(2026, 8, 17, 15, 30));
    dialog.pattern.set('DISCRETIONARY');
    dialog.direction.set('BUY');

    dialog.submit();

    expect(close).toHaveBeenCalledWith({
      tradeDate: new Date(2026, 8, 17),
      ticker: 'KTTA',
      pattern: 'DISCRETIONARY',
      direction: 'BUY',
    });
  });

  it('closes with nothing on cancel', () => {
    const { dialog, close } = setup();

    dialog.cancel();

    expect(close).toHaveBeenCalledWith(undefined);
  });
});
