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
 * Component spec for the **Locates** dialog of a candidate row (#607) :
 *
 * - **Lists the day's locates on the row's ticker** — read by day and ticker, so the ones typed on
 *   the Account page show too.
 * - **Adds one** — the price starts from the candidate's quote and stays editable (a top-up often
 *   goes at another price) ; the cost previews live ; the locate is sent on the candidate, with the
 *   price shown.
 * - **Deletes one** through the danger confirmation ; cancelling never reaches the repository.
 * - **Closes with `true` only when something changed**, so the page reloads its totals then only.
 */

const DAY = new Date(2026, 8, 18);

const SGBX: LocatesDialogData = {
  candidateId: 'c-sgbx',
  ticker: 'SGBX',
  tradingDate: DAY,
  locatePerShare: 0.12,
};

function makeLocate(overrides: Partial<Locate> = {}): Locate {
  return {
    id: 'l-1',
    tradingDate: DAY,
    ticker: 'SGBX',
    shares: 2000,
    pricePerShare: 0.12,
    cost: 240,
    note: null,
    candidateId: 'c-sgbx',
    createdAt: DAY,
    updatedAt: DAY,
    ...overrides,
  };
}

class MockLocatesRepository extends LocatesRepository {
  listForDate = vi.fn((_date: Date, _ticker?: string): Observable<Locate[]> => of([makeLocate()]));
  listForCandidate = vi.fn((_id: string): Observable<Locate[]> => of([]));
  create = vi.fn((_input: LocateInput): Observable<Locate> => of(makeLocate({ id: 'l-2' })));
  update = vi.fn((_id: string, _update: LocateUpdate): Observable<Locate> => of(makeLocate()));
  delete = vi.fn((_id: string): Observable<void> => of(undefined));
}

function setup(options: { confirmed?: boolean; data?: Partial<LocatesDialogData> } = {}) {
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
  const fixture = TestBed.createComponent(LocatesDialog);
  fixture.detectChanges();
  return {
    fixture,
    dialog: fixture.componentInstance,
    repo: TestBed.inject(LocatesRepository) as MockLocatesRepository,
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

  it("starts the price from the candidate's quote and previews the cost", () => {
    const { dialog } = setup();
    expect(dialog.price()).toBe(0.12);
    expect(dialog.canAdd()).toBe(false);

    dialog.shares.set(1000);

    expect(dialog.cost()).toBe(120);
    expect(dialog.canAdd()).toBe(true);
  });

  it('a candidate with no quote waits for the price to be typed', () => {
    const { dialog } = setup({ data: { locatePerShare: null } });

    dialog.shares.set(1000);

    expect(dialog.canAdd()).toBe(false);
  });

  it('adds a top-up at another price on the candidate, then reloads and clears the shares', () => {
    const { dialog, repo } = setup();
    dialog.shares.set(1000);
    dialog.price.set(0.15);

    dialog.add();

    expect(repo.create).toHaveBeenCalledWith({
      shares: 1000,
      pricePerShare: 0.15,
      candidateId: 'c-sgbx',
      tradingDate: null,
      ticker: null,
      note: null,
    });
    expect(repo.listForDate).toHaveBeenCalledTimes(2);
    expect(dialog.shares()).toBeNull();
  });

  it('deletes a locate once the danger confirmation is accepted', () => {
    const { dialog, repo, confirm } = setup();

    dialog.delete(makeLocate());

    expect(confirm.ask).toHaveBeenCalledWith(
      'candidates.locates.confirmDelete',
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
