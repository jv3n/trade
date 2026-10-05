import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MAT_DIALOG_DATA, MatDialogRef, StbToast } from '@portfolioai/ui';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Locate, LocateInput, LocateUpdate } from '../../../core/api/locates/locates.model';
import { LocatesRepository } from '../../../core/api/locates/locates.repository';
import { ConfirmService } from '../../../core/app-state/confirm.service';
import { LocatesDialog, LocatesDialogData } from './locates-dialog';

/**
 * Component spec for the dialog of a (day, ticker)'s locates (#625) — opened from the trade sheet
 * and from Today :
 *
 * - **Lists the locates of that day and ticker**, wherever they were typed.
 * - **Adds one** — the price starts from the last price paid and stays editable (a top-up often goes at
 *   another price) ; the cost previews live ; the locate is sent on the dialog's day and ticker.
 * - **Corrects one in place** — shares and price, an edit so no confirmation ; cancelling keeps it.
 * - **Deletes one** through the danger confirmation ; cancelling never reaches the repository.
 * - **Adds the rows up** — the shares to weigh against the position, and the cost.
 * - **Weighs each locate against the share's price** (the 2 % rule) — the share's price starting
 *   from the last locate's, else the day's PM open, and the day's blended weight on the total.
 * - **Closes with `true` only when something changed**, so the page reloads its totals then only.
 */

const DAY = new Date(2026, 8, 18);

const SGBX: LocatesDialogData = {
  tradingDate: DAY,
  ticker: 'SGBX',
  lastPrice: 0.12,
  stockPrice: null,
};

function makeLocate(overrides: Partial<Locate> = {}): Locate {
  return {
    id: 'l-1',
    tradingDate: DAY,
    ticker: 'SGBX',
    shares: 2000,
    pricePerShare: 0.12,
    stockPrice: null,
    cost: 240,
    note: null,
    createdAt: DAY,
    updatedAt: DAY,
    ...overrides,
  };
}

class MockLocatesRepository extends LocatesRepository {
  listForDate = vi.fn((_date: Date, _ticker?: string): Observable<Locate[]> => of([makeLocate()]));
  create = vi.fn((_input: LocateInput): Observable<Locate> => of(makeLocate({ id: 'l-2' })));
  update = vi.fn((_id: string, _update: LocateUpdate): Observable<Locate> => of(makeLocate()));
  delete = vi.fn((_id: string): Observable<void> => of(undefined));
}

function setup(
  options: { confirmed?: boolean; data?: Partial<LocatesDialogData>; locates?: Locate[] } = {},
) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [LocatesDialog],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      { provide: MAT_DIALOG_DATA, useValue: { ...SGBX, ...options.data } },
      { provide: MatDialogRef, useValue: { close } },
      { provide: LocatesRepository, useClass: MockLocatesRepository },
      { provide: StbToast, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: ConfirmService, useValue: { ask: vi.fn(() => of(options.confirmed ?? true)) } },
    ],
  });
  const repo = TestBed.inject(LocatesRepository) as MockLocatesRepository;
  if (options.locates) repo.listForDate.mockReturnValue(of(options.locates));
  const fixture = TestBed.createComponent(LocatesDialog);
  fixture.detectChanges();
  return {
    fixture,
    dialog: fixture.componentInstance,
    repo,
    confirm: TestBed.inject(ConfirmService) as unknown as { ask: ReturnType<typeof vi.fn> },
    close,
  };
}

describe('LocatesDialog', () => {
  it("lists the day's locates on the row's ticker", () => {
    const { dialog, repo, fixture } = setup();

    expect(repo.listForDate).toHaveBeenCalledWith(DAY, 'SGBX');
    expect(dialog.locates()).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.locate-list tbody tr')).toHaveLength(1);
  });

  it('starts the price from the last price paid and previews the cost', () => {
    const { dialog } = setup();
    expect(dialog.price()).toBe(0.12);
    expect(dialog.canAdd()).toBe(false);

    dialog.shares.set(1000);

    expect(dialog.cost()).toBe(120);
    expect(dialog.canAdd()).toBe(true);
  });

  it('a first locate on the ticker waits for the price to be typed', () => {
    const { dialog } = setup({ data: { lastPrice: null } });

    dialog.shares.set(1000);

    expect(dialog.canAdd()).toBe(false);
  });

  it("adds a top-up at another price on the dialog's day and ticker, then reloads", () => {
    const { dialog, repo } = setup();
    dialog.shares.set(1000);
    dialog.price.set(0.15);

    dialog.add();

    expect(repo.create).toHaveBeenCalledWith({
      tradingDate: DAY,
      ticker: 'SGBX',
      shares: 1000,
      pricePerShare: 0.15,
      stockPrice: null,
      note: null,
    });
    expect(repo.listForDate).toHaveBeenCalledTimes(2);
    expect(dialog.shares()).toBeNull();
  });

  it('corrects a row in place — its shares and price, no confirmation', () => {
    const { dialog, repo } = setup();
    dialog.startEdit(makeLocate());
    dialog.setEditShares(1500);
    dialog.setEditPrice(0.1);
    expect(dialog.editCost()).toBe(150);

    dialog.saveEdit(makeLocate());

    expect(repo.update).toHaveBeenCalledWith('l-1', {
      shares: 1500,
      pricePerShare: 0.1,
      stockPrice: null,
      note: null,
    });
    expect(dialog.editing()).toBeNull();
    expect(repo.listForDate).toHaveBeenCalledTimes(2);
  });

  it('cancelling a correction leaves the locate as it was', () => {
    const { dialog, repo } = setup();
    dialog.startEdit(makeLocate());

    dialog.cancelEdit();

    expect(dialog.editing()).toBeNull();
    expect(repo.update).not.toHaveBeenCalled();
  });

  // A top-up is the same share : its price starts from the last locate's.
  it("weighs each locate against the share's price, a new one starting from the last", () => {
    const { dialog } = setup({ locates: [makeLocate({ stockPrice: 2.4 })] });

    expect(dialog.percentOf(makeLocate({ stockPrice: 2.4 }))).toBeCloseTo(5, 6);
    expect(dialog.stockPrice()).toBe(2.4);
    expect(dialog.percent()).toBeCloseTo(5, 6);
  });

  it("starts the share's price from the day's PM open when no locate has one", () => {
    const { dialog } = setup({ data: { stockPrice: 1.85 } });

    expect(dialog.stockPrice()).toBe(1.85);
  });

  it("keeps a share's price typed over the one it started from", () => {
    const { dialog } = setup({ data: { stockPrice: 1.85 } });

    dialog.setStockPrice(2.1);

    expect(dialog.stockPrice()).toBe(2.1);
  });

  // « Was this ticker under 2 % today » : the rows answer per purchase, the total for the day.
  it("weighs the day's locates together on the total row", () => {
    const { dialog } = setup({
      locates: [
        makeLocate({ shares: 2000, pricePerShare: 0.04, stockPrice: 2.5, cost: 80 }),
        makeLocate({ id: 'l-2', shares: 500, pricePerShare: 0.06, stockPrice: 2.4, cost: 30 }),
      ],
    });

    expect(dialog.totalPercent()).toBeCloseTo(1.774, 3);
    expect(dialog.breach(dialog.totalPercent())).toBe(false);
    expect(
      dialog.breach(dialog.percentOf(makeLocate({ pricePerShare: 0.06, stockPrice: 2.4 }))),
    ).toBe(true);
  });

  it('adds the rows up — the shares and the cost', () => {
    const { dialog } = setup({
      locates: [makeLocate(), makeLocate({ id: 'l-2', shares: 500, cost: 60 })],
    });

    expect(dialog.totalShares()).toBe(2500);
    expect(dialog.totalCost()).toBe(300);
  });

  it('shows the price hint only when there is a last price to start from', () => {
    const first = setup({ data: { lastPrice: null } });
    expect(first.fixture.nativeElement.querySelector('.hint')).toBeNull();
  });

  it('deletes a locate once the danger confirmation is accepted', () => {
    const { dialog, repo, confirm } = setup();

    dialog.delete(makeLocate());

    expect(confirm.ask).toHaveBeenCalledWith(
      'locates.confirmDelete',
      expect.objectContaining({ variant: 'danger' }),
    );
    expect(repo.delete).toHaveBeenCalledWith('l-1');
  });

  it('keeps the locate when the confirmation is cancelled', () => {
    const { dialog, repo } = setup({ confirmed: false });

    dialog.delete(makeLocate());

    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('closes with true only once something changed', () => {
    const first = setup();
    first.dialog.close();
    expect(first.close).toHaveBeenCalledWith(false);

    TestBed.resetTestingModule();
    const second = setup();
    second.dialog.shares.set(1000);
    second.dialog.add();
    second.dialog.close();
    expect(second.close).toHaveBeenCalledWith(true);
  });
});
