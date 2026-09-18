import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { AddTradeDialog, AddTradeDialogData } from './add-trade-dialog';

/**
 * Pins the multi-execution editor of [AddTradeDialog] (issue #93) : the dynamic executions list, the
 * live preview mirroring the backend calculator, and the submit payload (direction + cleaned
 * executions, no flat aggregates). Template rendering isn't exercised — the component logic is.
 */
describe('AddTradeDialog', () => {
  let close: ReturnType<typeof vi.fn>;

  function setup(data: AddTradeDialogData) {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [AddTradeDialog],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        provideNativeDateAdapter(),
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: StatsRepository,
          useValue: {
            findAll: () =>
              of({ content: [], pageIndex: 0, pageSize: 50, totalElements: 0, totalPages: 0 }),
          },
        },
      ],
    });
    return TestBed.createComponent(AddTradeDialog).componentInstance;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('create mode starts with a single empty ENTRY row', () => {
    const c = setup({ entry: null });
    expect(c.executions()).toEqual([{ kind: 'ENTRY', shares: null, price: null }]);
  });

  it('addExecution / removeExecution mutate the list', () => {
    const c = setup({ entry: null });
    c.addExecution('EXIT');
    expect(c.executions()).toHaveLength(2);
    expect(c.executions()[1].kind).toBe('EXIT');
    c.removeExecution(0);
    expect(c.executions()).toHaveLength(1);
    expect(c.executions()[0].kind).toBe('EXIT');
  });

  it('preview mirrors the backend calculator for a closed short', () => {
    const c = setup({ entry: null });
    c.setDirection('SHORT');
    c.setExecutionShares(0, 100);
    c.setExecutionPrice(0, 5);
    c.addExecution('EXIT');
    c.setExecutionShares(1, 100);
    c.setExecutionPrice(1, 4);

    const p = c.preview();
    expect(p.size).toBe(100);
    expect(p.profitDollars).toBe(100); // short: (5 - 4) * 100
    expect(p.status).toBe('CLOSED');
  });

  it('flags an over-exited position as invalid and blocks submit', () => {
    const c = setup({ entry: null });
    c.setDirection('SHORT');
    c.setExecutionShares(0, 100);
    c.setExecutionPrice(0, 5);
    c.addExecution('EXIT');
    c.setExecutionShares(1, 150);
    c.setExecutionPrice(1, 4);

    expect(c.executionInvalid()).toBe(true);
    c.submit();
    expect(close).not.toHaveBeenCalled();
  });

  it('submit emits direction + cleaned executions, dropping empty rows', () => {
    const c = setup({ entry: null });
    c.setDirection('SHORT');
    c.setExecutionShares(0, 100);
    c.setExecutionPrice(0, 5);
    c.addExecution('EXIT'); // left blank → must be dropped on submit
    c.model.update((m) => ({ ...m, ticker: 'BAC' }));

    c.submit();

    expect(close).toHaveBeenCalledTimes(1);
    const input = close.mock.calls[0][0];
    expect(input.direction).toBe('SHORT');
    expect(input.executions).toEqual([{ kind: 'ENTRY', shares: 100, price: 5 }]);
  });
});
