import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { StbToast } from '@portfolioai/ui';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { JournalRepository } from '../../../core/api/journal/journal.repository';
import { StatsRepository } from '../../../core/api/stats/stats.repository';
import { DataPage } from './data';

/**
 * Spec for the Settings › Data page — the two CSV exports of the back-office (#196). What it pins :
 *
 * - **Download plumbing** — the blob reaches the browser through a throwaway anchor whose
 *   `download` filename carries the dataset and the day, and the object URL is revoked right after.
 * - **Busy state** — both buttons are held while one download is in flight, and freed on either
 *   outcome, so a double-click can't fire two requests.
 * - **Snackbar variant matches the outcome** — success panel on a clean response, error panel when
 *   the repository throws.
 */
describe('DataPage', () => {
  let statsExport: Subject<Blob>;
  let journalExport: Subject<Blob>;
  let toastShown: Mock<(variant: 'success' | 'error', message: string) => void>;
  let anchorClick: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;
  let lastAnchor: HTMLAnchorElement;

  beforeEach(() => {
    statsExport = new Subject<Blob>();
    journalExport = new Subject<Blob>();
    toastShown = vi.fn();
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
            exportCsv: (): Observable<Blob> => statsExport.asObservable(),
          } as unknown as StatsRepository,
        },
        {
          provide: JournalRepository,
          useValue: {
            exportCsv: (): Observable<Blob> => journalExport.asObservable(),
          } as unknown as JournalRepository,
        },
        {
          provide: StbToast,
          useValue: {
            success: (message: string) => toastShown('success', message),
            error: (message: string) => toastShown('error', message),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(): DataPage {
    const fixture = TestBed.createComponent(DataPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('hands the stats CSV to the browser as a dated download', () => {
    const page = setup();

    page.downloadStats();
    expect(page.exporting()).toBe('stats');

    statsExport.next(new Blob(['tradeDate,ticker']));
    statsExport.complete();

    expect(anchorClick).toHaveBeenCalled();
    expect(lastAnchor.download).toMatch(/^stats-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(revoke).toHaveBeenCalledWith('blob:stats');
    expect(page.exporting()).toBeNull();
    expect(toastShown.mock.calls.at(-1)?.[0]).toBe('success');
  });

  it('the journal export names its own file, and holds both buttons meanwhile', () => {
    const page = setup();

    page.downloadJournal();
    // Not a boolean but the dataset in flight : the other button reads it to disable itself too.
    expect(page.exporting()).toBe('journal');

    journalExport.next(new Blob(['tradeDate,ticker,executions']));
    journalExport.complete();

    expect(lastAnchor.download).toMatch(/^journal-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(page.exporting()).toBeNull();
  });

  it('frees the buttons and toasts an error when an export fails', () => {
    const page = setup();

    page.downloadJournal();
    journalExport.error(new Error('500 from server'));

    expect(page.exporting()).toBeNull();
    expect(anchorClick).not.toHaveBeenCalled();
    expect(toastShown.mock.calls.at(-1)?.[0]).toBe('error');
  });
});
