import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MatDialogRef, provideNativeDateAdapter } from '@portfolioai/ui';
import { describe, expect, it, vi } from 'vitest';
import { LocateDialog } from './locate-dialog';

/**
 * Component spec for the Account page's « Locate » dialog (#608) — a locate on a ticker off the
 * candidates :
 *
 * - **Saves only a whole locate** — a ticker, shares above zero and a price (0 allowed : a locate
 *   charged nothing).
 * - **The cost previews live**, to the cent.
 * - **Closes with the locate to save**, on no candidate, its ticker upper-cased and a blank note
 *   dropped ; cancelling closes with nothing.
 */
function setup() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [LocateDialog],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(LocateDialog);
  fixture.detectChanges();
  return { dialog: fixture.componentInstance, close };
}

function fillAtxg(dialog: LocateDialog): void {
  dialog.textForm.ticker().value.set(' atxg ');
  dialog.shares.set(1000);
  dialog.price.set(0.05);
}

describe('LocateDialog', () => {
  it('waits for a ticker, shares and a price before saving', () => {
    const { dialog } = setup();
    expect(dialog.canSave()).toBe(false);

    dialog.shares.set(1000);
    dialog.price.set(0.05);
    expect(dialog.canSave()).toBe(false);

    dialog.textForm.ticker().value.set('ATXG');
    expect(dialog.canSave()).toBe(true);
  });

  it('previews the cost live', () => {
    const { dialog } = setup();

    fillAtxg(dialog);

    expect(dialog.cost()).toBe(50);
  });

  it('closes with the locate on no candidate, its ticker upper-cased', () => {
    const { dialog, close } = setup();
    fillAtxg(dialog);
    dialog.setDate(new Date(2026, 8, 18, 15, 30));

    dialog.submit();

    expect(close).toHaveBeenCalledWith({
      shares: 1000,
      pricePerShare: 0.05,
      candidateId: null,
      tradingDate: new Date(2026, 8, 18),
      ticker: 'ATXG',
      note: null,
    });
  });

  it('closes with nothing on cancel', () => {
    const { dialog, close } = setup();

    dialog.cancel();

    expect(close).toHaveBeenCalledWith(undefined);
  });
});
