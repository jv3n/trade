/**
 * Tests on the CSV import drag-and-drop component. The portfolio is **CSV-driven** (read-only in
 * the UI per CLAUDE.md), so this component is the single ingress for portfolio data — every state
 * machine it implements has to be airtight or the user is stuck.
 *
 * Three areas, each in its own `describe` block :
 * - **`extractDate`** — parses `YYYY-MM-DD` out of Wealthsimple-style filenames. Frontend
 *   counterpart of the backend `extractDateFromFilename` (different concerns : the front uses it
 *   to display "import du 2026-04-24" before upload, the back uses it as `importedAt`).
 * - **Single-file flow** — `idle → previewing → preview → done` (or `error` from any state).
 * - **Multi-file batch flow** — drop several files, sort by date in the filename (so "today's"
 *   import is applied last and wins for current state), import them sequentially, stop on any
 *   failure with the offending filename in the error message.
 *
 * `makeFile` and `makeDrop` factories build the minimum DOM events needed — without them, every
 * test would carry six lines of `dataTransfer` casting noise.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PortfolioRepository } from '../../../core/api/portfolio/portfolio.repository';
import { CsvImport } from './csv-import';

const EMPTY_PREVIEW = { accounts: [], totalItems: 0, skippedRows: 0, warnings: [] };
const IMPORT_RESULT = {
  portfoliosCreated: 1,
  portfoliosUpdated: 0,
  totalImported: 3,
  skipped: 0,
  positionsClosed: 1,
  positionsReopened: 2,
};

function makeFile(name: string): File {
  return new File(['a,b'], name, { type: 'text/csv' });
}

function makeDrop(files: File[]): DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { files } as unknown as DataTransfer,
  } as unknown as DragEvent;
}

function makeFileInputChange(files: File[]): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  return { target: input } as unknown as Event;
}

describe('CsvImport', () => {
  let component: CsvImport;
  let fixture: ComponentFixture<CsvImport>;
  let service: {
    previewCsvImport: ReturnType<typeof vi.fn>;
    confirmCsvImport: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      previewCsvImport: vi.fn().mockReturnValue(of(EMPTY_PREVIEW)),
      confirmCsvImport: vi.fn().mockReturnValue(of(IMPORT_RESULT)),
    };

    await TestBed.configureTestingModule({
      imports: [CsvImport],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: PortfolioRepository, useValue: service },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CsvImport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ---- extractDate ----

  describe('extractDate', () => {
    it('extracts YYYY-MM-DD from filename', () => {
      expect(component.extractDate('holdings-report-2026-04-24.csv')).toBe('2026-04-24');
    });

    it('returns null when no date in filename', () => {
      expect(component.extractDate('export.csv')).toBeNull();
    });

    it('works wherever the date appears in the name', () => {
      expect(component.extractDate('ws_2025-12-31_positions.csv')).toBe('2025-12-31');
    });
  });

  // ---- Single file ----

  describe('single file drop', () => {
    it('transitions to previewing then preview', () => {
      component.onDrop(makeDrop([makeFile('report-2026-04-24.csv')]));
      expect(component.step()).toBe('preview');
      expect(service.previewCsvImport).toHaveBeenCalledOnce();
    });

    it('transitions to error when preview fails', () => {
      service.previewCsvImport.mockReturnValue(throwError(() => new Error('network')));
      component.onDrop(makeDrop([makeFile('report.csv')]));
      expect(component.step()).toBe('error');
      expect(component.error()).toBeTruthy();
    });

    it('confirm imports and emits imported', () => {
      const spy = vi.fn();
      component.imported.subscribe(spy);
      component.onDrop(makeDrop([makeFile('report.csv')]));
      component.confirm();
      expect(component.step()).toBe('done');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('confirm transitions to error when import fails', () => {
      service.confirmCsvImport.mockReturnValue(throwError(() => new Error('fail')));
      component.onDrop(makeDrop([makeFile('report.csv')]));
      component.confirm();
      expect(component.step()).toBe('error');
    });
  });

  // ---- Batch ----

  describe('multiple files drop', () => {
    const files = [
      makeFile('holdings-report-2026-04-25.csv'),
      makeFile('holdings-report-2026-04-24.csv'),
      makeFile('holdings-report-2026-04-29.csv'),
    ];

    it('transitions to batch-ready', () => {
      component.onDrop(makeDrop(files));
      expect(component.step()).toBe('batch-ready');
    });

    it('sorts files by filename (ascending date)', () => {
      component.onDrop(makeDrop(files));
      const names = component.pendingFiles().map((f) => f.name);
      expect(names).toEqual([
        'holdings-report-2026-04-24.csv',
        'holdings-report-2026-04-25.csv',
        'holdings-report-2026-04-29.csv',
      ]);
    });

    it('confirmBatch imports all files sequentially', () => {
      component.onDrop(makeDrop(files));
      component.confirmBatch();
      expect(service.confirmCsvImport).toHaveBeenCalledTimes(3);
    });

    it('emits imported when all files are done', () => {
      const spy = vi.fn();
      component.imported.subscribe(spy);
      component.onDrop(makeDrop(files));
      component.confirmBatch();
      expect(component.step()).toBe('done');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('stops and shows error if one file fails', () => {
      service.confirmCsvImport
        .mockReturnValueOnce(of(IMPORT_RESULT))
        .mockReturnValueOnce(throwError(() => new Error('fail')));
      component.onDrop(makeDrop(files));
      component.confirmBatch();
      expect(component.step()).toBe('error');
      // Error message is the i18n key path (no translations loaded in tests). The interpolation
      // params (filename) are not visible in the key itself, so we just verify the right key
      // fired.
      expect(component.error()).toBe('csvImport.errors.batchItem');
      expect(service.confirmCsvImport).toHaveBeenCalledTimes(2);
    });
  });

  // ---- cancel / reset ----

  describe('cancel', () => {
    it('resets all state to idle', () => {
      component.onDrop(makeDrop([makeFile('a.csv'), makeFile('b.csv')]));
      component.cancel();
      expect(component.step()).toBe('idle');
      expect(component.pendingFiles()).toHaveLength(0);
      expect(component.error()).toBeNull();
    });

    it('reset clears lastResult so the "again" banner is not stale', () => {
      component.onDrop(makeDrop([makeFile('report.csv')]));
      component.confirm();
      expect(component.lastResult()).not.toBeNull();
      component.reset();
      expect(component.step()).toBe('idle');
      expect(component.lastResult()).toBeNull();
    });
  });

  // ---- Drag & drop visual state ----

  describe('drag state', () => {
    it('onDragOver flips dragging on, onDragLeave flips it off', () => {
      const over = makeDrop([]);
      component.onDragOver(over);
      expect(component.dragging()).toBe(true);
      expect(over.preventDefault).toHaveBeenCalled();

      const leave = makeDrop([]);
      component.onDragLeave(leave);
      expect(component.dragging()).toBe(false);
      expect(leave.preventDefault).toHaveBeenCalled();
    });

    it('onDrop clears dragging even when no CSV is dropped', () => {
      component.onDragOver(makeDrop([]));
      component.onDrop(makeDrop([new File(['x'], 'image.png', { type: 'image/png' })]));
      expect(component.dragging()).toBe(false);
      expect(component.step()).toBe('idle');
      expect(service.previewCsvImport).not.toHaveBeenCalled();
    });

    it('onDrop filters out non-CSV files before triggering preview', () => {
      component.onDrop(
        makeDrop([new File(['x'], 'image.png', { type: 'image/png' }), makeFile('report.csv')]),
      );
      // Single CSV survives the filter → single-file flow, not batch.
      expect(component.step()).toBe('preview');
      expect(service.previewCsvImport).toHaveBeenCalledOnce();
    });
  });

  // ---- File input (click) ----

  describe('onFileChange', () => {
    it('handles a single file like a drop', () => {
      component.onFileChange(makeFileInputChange([makeFile('report.csv')]));
      expect(component.step()).toBe('preview');
      expect(service.previewCsvImport).toHaveBeenCalledOnce();
    });

    it('handles multiple files like a batch drop', () => {
      component.onFileChange(
        makeFileInputChange([makeFile('a-2026-04-24.csv'), makeFile('b-2026-04-25.csv')]),
      );
      expect(component.step()).toBe('batch-ready');
      expect(component.pendingFiles()).toHaveLength(2);
    });

    it('is a no-op when the input is empty', () => {
      component.onFileChange(makeFileInputChange([]));
      expect(component.step()).toBe('idle');
      expect(service.previewCsvImport).not.toHaveBeenCalled();
    });
  });

  // ---- Template rendering ----
  // Without forcing detectChanges in each state, every @if branch past "idle" stays unrendered
  // and the template coverage cratered (~15%). These tests pin each branch by setting signals
  // directly, calling detectChanges, then querying the DOM for the structural anchor.

  describe('template rendering', () => {
    function render(): HTMLElement {
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    const previewWithEverything = {
      totalItems: 2,
      skippedRows: 3,
      warnings: ['unmapped column "Notes"'],
      accounts: [
        {
          accountName: 'TFSA',
          items: [
            {
              ticker: 'AAPL',
              name: 'Apple',
              quantity: 10,
              avgBuyPrice: 100,
              assetType: 'STOCK',
              bookValue: 1000,
              currency: 'USD',
            },
            {
              ticker: 'MSFT',
              name: 'Microsoft',
              quantity: 5,
              avgBuyPrice: 200,
              assetType: 'STOCK',
              bookValue: 1000,
              currency: 'USD',
            },
          ],
        },
      ],
    };

    it('renders the drop zone in idle state', () => {
      expect(render().querySelector('.drop-zone')).not.toBeNull();
    });

    it('marks the drop zone with has-error and surfaces the error message', () => {
      component.step.set('error');
      component.error.set('boom');
      const el = render();
      expect(el.querySelector('.drop-zone.has-error')).not.toBeNull();
      expect(el.querySelector('.drop-error')?.textContent).toContain('boom');
    });

    it('toggles the dragging class when dragging is true', () => {
      component.dragging.set(true);
      expect(render().querySelector('.drop-zone.dragging')).not.toBeNull();
    });

    it('renders the parsing spinner while previewing', () => {
      component.step.set('previewing');
      expect(render().querySelector('.import-loading')).not.toBeNull();
    });

    it('renders the preview panel with skipped pill, warnings and rows', () => {
      component.preview.set(previewWithEverything);
      component.step.set('preview');
      const el = render();
      expect(el.querySelector('.preview-panel')).not.toBeNull();
      // The skipped-rows pill only renders when skippedRows > 0.
      expect(el.querySelector('.pill-gray')).not.toBeNull();
      // Warnings list.
      expect(el.querySelectorAll('.warning-row').length).toBe(1);
      // One row per item.
      expect(el.querySelectorAll('.preview-row').length).toBe(2);
      expect(el.querySelector('.btn-confirm')).not.toBeNull();
    });

    it('renders the importing spinner during single-file confirm', () => {
      component.step.set('importing');
      expect(render().querySelector('.import-loading')).not.toBeNull();
    });

    it('renders the batch list and only shows the date pill for dated files', () => {
      component.pendingFiles.set([makeFile('holdings-2026-04-24.csv'), makeFile('no-date.csv')]);
      component.step.set('batch-ready');
      const el = render();
      expect(el.querySelectorAll('.batch-item').length).toBe(2);
      // `extractDate` returns null on the second file → only one .batch-date renders.
      expect(el.querySelectorAll('.batch-date').length).toBe(1);
    });

    it('renders the batch progress spinner during batch-importing', () => {
      component.pendingFiles.set([makeFile('a.csv'), makeFile('b.csv')]);
      component.batchIndex.set(1);
      component.step.set('batch-importing');
      expect(render().querySelector('.import-loading')).not.toBeNull();
    });

    it('renders the done banner with both counters when > 0', () => {
      component.lastResult.set({ totalImported: 3, positionsClosed: 2, positionsReopened: 1 });
      component.step.set('done');
      const el = render();
      expect(el.querySelector('.import-done')).not.toBeNull();
      expect(el.querySelector('.counter-closed')).not.toBeNull();
      expect(el.querySelector('.counter-reopened')).not.toBeNull();
    });

    it('hides the counters in the done banner when both are zero', () => {
      component.lastResult.set({ totalImported: 3, positionsClosed: 0, positionsReopened: 0 });
      component.step.set('done');
      const el = render();
      expect(el.querySelector('.counter-closed')).toBeNull();
      expect(el.querySelector('.counter-reopened')).toBeNull();
    });
  });

  // ---- lastResult counters (drives the "done" banner) ----

  describe('lastResult counters', () => {
    it('exposes lifecycle counters after a single import', () => {
      component.onDrop(makeDrop([makeFile('report.csv')]));
      component.confirm();
      expect(component.lastResult()).toEqual({
        totalImported: 3,
        positionsClosed: 1,
        positionsReopened: 2,
      });
    });

    it('aggregates counters across a batch', () => {
      component.onDrop(makeDrop([makeFile('a-2026-04-24.csv'), makeFile('b-2026-04-25.csv')]));
      component.confirmBatch();
      // Two files × IMPORT_RESULT → totals doubled.
      expect(component.lastResult()).toEqual({
        totalImported: 6,
        positionsClosed: 2,
        positionsReopened: 4,
      });
    });
  });
});
