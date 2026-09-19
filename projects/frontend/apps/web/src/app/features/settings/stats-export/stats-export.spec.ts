import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { StatsExportPage } from './stats-export';

/**
 * Spec for the stats CSV export page. What it pins :
 *
 * - **Download plumbing** — the blob reaches the browser through a throwaway anchor whose
 *   `download` filename carries the day, and the object URL is revoked right after.
 * - **Busy state** — the button stays disabled while the request is in flight and frees up on both
 *   outcomes.
 * - **Snackbar variant matches the outcome** — success panel on a clean response, error panel when
 *   the repository throws.
 */
describe('StatsExportPage', () => {
  let exportSubject: Subject<Blob>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let anchorClick: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;
  let lastAnchor: HTMLAnchorElement;

  beforeEach(() => {
    exportSubject = new Subject<Blob>();
    snackBarOpen = vi.fn();
    anchorClick = vi.fn();
    revoke = vi.fn();

    // The download trick touches the DOM : stub the anchor click (jsdom would navigate) and keep
    // the anchor around so the filename can be asserted.
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'a') {
        lastAnchor = el as HTMLAnchorElement;
        lastAnchor.click = anchorClick as unknown as () => void;
      }
      return el;
    });

    // `URL.createObjectURL` / `revokeObjectURL` aren't implemented by jsdom. Stub both, but keep
    // `URL` **constructable** : the router needs `new URL(...)` during navigation setup, and a
    // plain-object stub would break it ("URL is not a constructor"). Same trick as the journal's
    // io spec — construction is delegated to the real URL.
    const RealURL = globalThis.URL;
    const urlStub = function (...args: ConstructorParameters<typeof URL>) {
      return new RealURL(...args);
    } as unknown as typeof URL;
    urlStub.prototype = RealURL.prototype;
    urlStub.createObjectURL = vi.fn(() => 'blob:stats') as unknown as typeof URL.createObjectURL;
    urlStub.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    vi.stubGlobal('URL', urlStub);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: StatsRepository,
          useValue: {
            exportCsv: (): Observable<Blob> => exportSubject.asObservable(),
          } as unknown as StatsRepository,
        },
        { provide: MatSnackBar, useValue: { open: snackBarOpen } },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(): StatsExportPage {
    const fixture = TestBed.createComponent(StatsExportPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('hands the CSV blob to the browser as a dated download', () => {
    const page = setup();

    page.download();
    expect(page.exporting()).toBe(true);

    exportSubject.next(new Blob(['Date,Pattern,Ticker']));
    exportSubject.complete();

    expect(anchorClick).toHaveBeenCalled();
    expect(lastAnchor.download).toMatch(/^stats-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(revoke).toHaveBeenCalledWith('blob:stats');
    expect(page.exporting()).toBe(false);
    expect(snackBarOpen.mock.calls.at(-1)?.[2].panelClass).toBe('stb-snack-bar--success');
  });

  it('frees the button and toasts an error when the export fails', () => {
    const page = setup();

    page.download();
    exportSubject.error(new Error('500 from server'));

    expect(page.exporting()).toBe(false);
    expect(anchorClick).not.toHaveBeenCalled();
    expect(snackBarOpen.mock.calls.at(-1)?.[2].panelClass).toBe('stb-snack-bar--error');
  });
});
