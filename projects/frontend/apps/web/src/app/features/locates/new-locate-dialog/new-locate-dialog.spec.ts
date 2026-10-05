import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MatDialogRef, provideNativeDateAdapter } from '@portfolioai/ui';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Candidate } from '../../../core/api/candidates/candidates.model';
import { CandidatesRepository } from '../../../core/api/candidates/candidates.repository';
import { NewLocateDialog } from './new-locate-dialog';

/**
 * Component spec for the « new locate » dialog (#625) — Today and the Account page :
 *
 * - **Saves only a whole locate** — a ticker, shares above zero and a price (0 allowed : a locate
 *   charged nothing).
 * - **The cost previews live**, to the cent, and so does the locate's weight against the share's
 *   price — amber at 2 % or more. The share's price starts from the PM open of that day's candidate
 *   on the ticker, until one is typed ; it is saved with the locate.
 * - **Closes with the locate to save**, on the day picked, its ticker upper-cased and a blank note
 *   dropped ; cancelling closes with nothing.
 */
function setup(dayCandidates: Partial<Candidate>[] = []) {
  const close = vi.fn();
  const listForDate = vi.fn((_date: Date): Observable<Candidate[]> =>
    of(dayCandidates as Candidate[]),
  );
  TestBed.configureTestingModule({
    imports: [NewLocateDialog],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      { provide: MatDialogRef, useValue: { close } },
      { provide: CandidatesRepository, useValue: { listForDate } },
    ],
  });
  const fixture = TestBed.createComponent(NewLocateDialog);
  fixture.detectChanges();
  return { dialog: fixture.componentInstance, close, listForDate };
}

function fillAtxg(dialog: NewLocateDialog): void {
  dialog.textForm.ticker().value.set(' atxg ');
  dialog.shares.set(1000);
  dialog.price.set(0.05);
}

describe('NewLocateDialog', () => {
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

  it('closes with the locate on the day picked, its ticker upper-cased', () => {
    const { dialog, close } = setup();
    fillAtxg(dialog);
    dialog.setDate(new Date(2026, 8, 18, 15, 30));

    dialog.submit();

    expect(close).toHaveBeenCalledWith({
      tradingDate: new Date(2026, 8, 18),
      ticker: 'ATXG',
      shares: 1000,
      pricePerShare: 0.05,
      stockPrice: null,
      note: null,
    });
  });

  it("weighs the locate against the share's price, and keeps that price with it", () => {
    const { dialog, close } = setup();
    fillAtxg(dialog);
    dialog.setStockPrice(2.5);

    expect(dialog.percent()).toBeCloseTo(2, 6);
    dialog.submit();

    expect(close).toHaveBeenCalledWith(expect.objectContaining({ stockPrice: 2.5 }));
  });

  // The rule needs the share's price : it starts from that day's candidate, matched by ticker.
  it("starts the share's price from the PM open of that day's candidate on the ticker", () => {
    const { dialog } = setup([{ ticker: 'SGBX', pmOpen: 1.85 }]);

    dialog.textForm.ticker().value.set('sgbx');
    dialog.price.set(0.04);

    expect(dialog.stockPrice()).toBe(1.85);
    expect(dialog.breach()).toBe(true); // 0.04 on 1.85 = 2.16 %
  });

  it("reads the candidates of the day picked, and keeps a share's price typed", () => {
    const { dialog, listForDate } = setup([{ ticker: 'SGBX', pmOpen: 1.85 }]);
    dialog.setDate(new Date(2026, 8, 18, 15, 30));
    expect(listForDate).toHaveBeenLastCalledWith(new Date(2026, 8, 18));

    dialog.textForm.ticker().value.set('SGBX');
    dialog.setStockPrice(2.4);

    expect(dialog.stockPrice()).toBe(2.4);
  });

  it('closes with nothing on cancel', () => {
    const { dialog, close } = setup();

    dialog.cancel();

    expect(close).toHaveBeenCalledWith(undefined);
  });
});
