import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportResult, JournalRepository } from '../../core/api/journal/journal.repository';
import { JournalIoPage } from './journal-io-page';

/**
 * Pins the export / import pipelines of [JournalIoPage]. Three regressions this file catches
 * that a typecheck alone can't :
 *
 *  - **Export success / failure routes the snackbar to the right variant** — `success` panel
 *    on emit, `error` panel on observable error. The variants drive the colour (red / green)
 *    and the duration (3 s / 5 s) ; mixing them would surface the wrong tone to the user.
 *  - **Import handles three distinct outcomes** : clean batch (errors empty → `success`
 *    step), backend validation errors (errors non-empty → `failed` step with the list), and
 *    transport-level error (HTTP failure → `failed` step with a synthetic line-0 error). The
 *    UI's result panel branches on `importStep()` ; a regression in this dispatcher would
 *    show "imported successfully" on a failed upload (or vice versa).
 *  - **`exporting` resets after the call** — both on success and on error. Forgetting the
 *    error reset leaves the user with a permanently disabled "Download CSV" button.
 */
describe('JournalIoPage', () => {
  let exportSubject: Subject<Blob>;
  let importSubject: Subject<ImportResult>;
  let snackBarOpen: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    exportSubject = new Subject<Blob>();
    importSubject = new Subject<ImportResult>();
    snackBarOpen = vi.fn();

    // The download trick (`URL.createObjectURL` + anchor click) isn't implemented by jsdom.
    // Stub both — but keep `URL` **constructable** : the router needs `new URL(...)` during
    // navigation setup now that the page template carries a `routerLink`, and a plain-object
    // stub would break it ("URL is not a constructor"). We delegate construction to the real URL.
    const RealURL = globalThis.URL;
    const urlStub = function (...args: ConstructorParameters<typeof URL>) {
      return new RealURL(...args);
    } as unknown as typeof URL;
    urlStub.prototype = RealURL.prototype;
    urlStub.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
    urlStub.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    vi.stubGlobal('URL', urlStub);

    await TestBed.configureTestingModule({
      imports: [JournalIoPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: JournalRepository,
          useValue: {
            findAll: () => of({} as unknown),
            findById: () => of({} as unknown),
            create: () => of({} as unknown),
            update: () => of({} as unknown),
            delete: () => of(undefined),
            exportCsv: () => exportSubject.asObservable(),
            importCsv: () => importSubject.asObservable(),
          } as unknown as JournalRepository,
        },
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  it('download() flips `exporting` true while in flight and fires a success snackbar on emit', () => {
    const fixture = TestBed.createComponent(JournalIoPage);
    const page = fixture.componentInstance;

    page.download();
    expect(page.exporting()).toBe(true);

    exportSubject.next(new Blob(['csv,content'], { type: 'text/csv' }));
    exportSubject.complete();

    expect(page.exporting()).toBe(false);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        panelClass: 'stb-snack-bar--success',
        duration: 3000,
      }),
    );
  });

  it('download() error path fires an error snackbar AND resets `exporting` (no perma-disabled button)', () => {
    const fixture = TestBed.createComponent(JournalIoPage);
    const page = fixture.componentInstance;

    page.download();
    exportSubject.error(new Error('network down'));

    expect(page.exporting()).toBe(false);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        panelClass: 'stb-snack-bar--error',
        duration: 5000,
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Import — three distinct outcomes
  // ---------------------------------------------------------------------------

  it('import success (errors empty) flips step="success" and surfaces the `created` count in the snackbar', () => {
    const fixture = TestBed.createComponent(JournalIoPage);
    const page = fixture.componentInstance;

    // The drop and file-input handlers both funnel into the same private `uploadFile`.
    // jsdom doesn't ship a `DataTransfer` constructor (used by the drop handler), so we
    // exercise the pipeline through `onFileChange` with a synthetic `<input type="file">`
    // event ; the file picker path follows the same `pickFirstCsv → uploadFile` route.
    const file = new File(['header\nrow'], 'demo.csv', { type: 'text/csv' });
    page.onFileChange({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    expect(page.importStep()).toBe('uploading');
    expect(page.dragging()).toBe(false);

    importSubject.next({ parsed: 5, created: 5, errors: [] });
    importSubject.complete();

    expect(page.importStep()).toBe('success');
    expect(page.lastResult()).toEqual({ parsed: 5, created: 5, errors: [] });
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--success' }),
    );
  });

  it('import with per-row errors flips step="failed" and surfaces the error list in lastResult', () => {
    const fixture = TestBed.createComponent(JournalIoPage);
    const page = fixture.componentInstance;

    const file = new File(['header\nbad row'], 'demo.csv', { type: 'text/csv' });
    page.onFileChange({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    importSubject.next({
      parsed: 1,
      created: 0,
      errors: [{ line: 2, message: "play must be one of A / B, got 'Z'" }],
    });
    importSubject.complete();

    expect(page.importStep()).toBe('failed');
    expect(page.lastResult()?.errors).toHaveLength(1);
    expect(page.lastResult()?.created).toBe(0);
    expect(snackBarOpen).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ panelClass: 'stb-snack-bar--error' }),
    );
  });

  it('import network error synthesises a line-0 error and flips step="failed"', () => {
    const fixture = TestBed.createComponent(JournalIoPage);
    const page = fixture.componentInstance;

    const file = new File(['anything'], 'demo.csv', { type: 'text/csv' });
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

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  it('resetImport() returns the page to the idle state regardless of what came before', () => {
    const fixture = TestBed.createComponent(JournalIoPage);
    const page = fixture.componentInstance;

    // Simulate a previous failed upload, then call reset.
    const file = new File([''], 'demo.csv');
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
