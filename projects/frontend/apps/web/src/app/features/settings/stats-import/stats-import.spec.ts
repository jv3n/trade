import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportResult, StatsRepository } from '../../../core/api/stats/stats.repository';
import { StatsImportPage } from './stats-import';

/**
 * Pins the import + export pipelines of [StatsImportPage] — the admin stats back-office surface.
 *
 * Import shares the atomic-batch contract with the journal importer — same three outcomes :
 *
 *  - **clean batch** (errors empty) → `success` step + success snackbar carrying `created`,
 *  - **per-row validation errors** (errors non-empty) → `failed` step with the error list,
 *  - **transport error** (HTTP failure) → `failed` step with a synthetic line-0 error.
 *
 * Export pins the `exporting` busy flag flip + the success/error snackbar — a regression there would
 * leave the button perma-disabled or claim success on a failed download.
 */
describe('StatsImportPage', () => {
  let importSubject: Subject<ImportResult>;
  let exportSubject: Subject<Blob>;
  let snackBarOpen: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    importSubject = new Subject<ImportResult>();
    exportSubject = new Subject<Blob>();
    snackBarOpen = vi.fn();

    // The download trick (`URL.createObjectURL` + anchor click) isn't implemented by jsdom — stub
    // both so the `tap` body doesn't throw on a successful export.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    await TestBed.configureTestingModule({
      imports: [StatsImportPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: StatsRepository,
          useValue: {
            importCsv: () => importSubject.asObservable(),
            exportCsv: () => exportSubject.asObservable(),
          } as unknown as StatsRepository,
        },
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('download() flips `exporting` true while in flight and fires a success snackbar on emit', () => {
    const fixture = TestBed.createComponent(StatsImportPage);
    const page = fixture.componentInstance;

    page.download();
    expect(page.exporting()).toBe(true);

    exportSubject.next(new Blob(['csv,content'], { type: 'text/csv' }));
    exportSubject.complete();

    expect(page.exporting()).toBe(false);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success', duration: 3000 }),
    );
  });

  it('download() error path resets `exporting` and fires an error snackbar (no perma-disabled button)', () => {
    const fixture = TestBed.createComponent(StatsImportPage);
    const page = fixture.componentInstance;

    page.download();
    exportSubject.error(new Error('network down'));

    expect(page.exporting()).toBe(false);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error', duration: 5000 }),
    );
  });

  it('import success (errors empty) flips step="success" and surfaces the created count', () => {
    const fixture = TestBed.createComponent(StatsImportPage);
    const page = fixture.componentInstance;

    // jsdom ships no `DataTransfer`, so we drive the pipeline through the file-input path ; the
    // drop handler funnels into the same `pickFirstCsv → uploadFile` route.
    const file = new File(['header\nrow'], 'stats.csv', { type: 'text/csv' });
    page.onFileChange({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    expect(page.importStep()).toBe('uploading');

    importSubject.next({ parsed: 105, created: 105, errors: [] });
    importSubject.complete();

    expect(page.importStep()).toBe('success');
    expect(page.lastResult()).toEqual({ parsed: 105, created: 105, errors: [] });
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success', duration: 3000 }),
    );
  });

  it('import with per-row errors flips step="failed" and keeps the error list', () => {
    const fixture = TestBed.createComponent(StatsImportPage);
    const page = fixture.componentInstance;

    const file = new File(['header\nbad'], 'stats.csv', { type: 'text/csv' });
    page.onFileChange({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    importSubject.next({
      parsed: 1,
      created: 0,
      errors: [{ line: 2, message: 'Open must be positive, got -1' }],
    });
    importSubject.complete();

    expect(page.importStep()).toBe('failed');
    expect(page.lastResult()?.created).toBe(0);
    expect(page.lastResult()?.errors).toHaveLength(1);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error', duration: 5000 }),
    );
  });

  it('import network error synthesises a line-0 error and flips step="failed"', () => {
    const fixture = TestBed.createComponent(StatsImportPage);
    const page = fixture.componentInstance;

    const file = new File(['anything'], 'stats.csv', { type: 'text/csv' });
    page.onFileChange({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    importSubject.error(new Error('connection refused'));

    expect(page.importStep()).toBe('failed');
    expect(page.lastResult()?.errors).toHaveLength(1);
    expect(page.lastResult()?.errors[0].line).toBe(0);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error' }),
    );
  });

  it('resetImport() returns the page to idle regardless of prior state', () => {
    const fixture = TestBed.createComponent(StatsImportPage);
    const page = fixture.componentInstance;

    const file = new File([''], 'stats.csv');
    page.onFileChange({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);
    importSubject.error(new Error('boom'));

    expect(page.importStep()).toBe('failed');
    expect(page.lastResult()).not.toBeNull();

    page.resetImport();

    expect(page.importStep()).toBe('idle');
    expect(page.lastResult()).toBeNull();
  });
});
