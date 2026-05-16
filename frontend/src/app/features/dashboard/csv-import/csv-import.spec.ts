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
const IMPORT_RESULT = { portfoliosCreated: 1, portfoliosUpdated: 0, totalImported: 3, skipped: 0 };

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
  });
});
