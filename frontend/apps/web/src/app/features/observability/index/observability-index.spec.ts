/**
 * Tests on [ObservabilityIndexPage] — Phase 3 #1 PR3 landing page. Thin presentation layer over
 * `NarrativeObservabilityRepository.findTickers()`. What we pin :
 *
 * - **`findTickers` fires on init** — the page can't render without the list.
 * - **Empty-state branch** when the backend returns `[]` — the page shows the « nothing
 *   generated yet » hint, not an empty list.
 * - **Error banner** when the fetch fails.
 * - **Order is preserved verbatim** — the backend is the authority on sort (most-recent first).
 *   A regression that re-sorted client-side would silently disagree with the per-symbol page's
 *   ordering on the same data.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import {
  NarrativeObservabilityRepository,
  TickerObservationIndex,
} from '../../../core/api/analysis/narrative-observability.repository';
import { ObservabilityIndexPage } from './observability-index';

describe('ObservabilityIndexPage', () => {
  let fixture: ComponentFixture<ObservabilityIndexPage>;
  let component: ObservabilityIndexPage;
  const findTickers = vi.fn();

  async function setup() {
    findTickers.mockReset();
    await TestBed.configureTestingModule({
      imports: [ObservabilityIndexPage],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: NarrativeObservabilityRepository,
          useValue: { findTickers, findFor: vi.fn() },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ObservabilityIndexPage);
    component = fixture.componentInstance;
  }

  it('fires findTickers on init and hydrates the list', async () => {
    await setup();
    findTickers.mockReturnValue(of(sampleList()));

    fixture.detectChanges();

    expect(findTickers).toHaveBeenCalled();
    expect(component.tickers().length).toBe(2);
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toBeNull();
  });

  it('flags isEmpty when the backend returns no ticker', async () => {
    await setup();
    findTickers.mockReturnValue(of([]));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    expect(component.tickers()).toEqual([]);
  });

  it('shows a load-error banner when the fetch fails', async () => {
    await setup();
    findTickers.mockReturnValue(throwError(() => new Error('503')));

    fixture.detectChanges();

    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
    expect(component.isEmpty()).toBe(false);
  });

  it('preserves the backend-provided order (most-recent first)', async () => {
    // Backend ordered NVDA before AAPL. The page must NOT re-sort client-side — pin the
    // verbatim copy so a future « let's sort alphabetically » regression is caught.
    await setup();
    const inputOrder = sampleList();
    findTickers.mockReturnValue(of(inputOrder));

    fixture.detectChanges();

    expect(component.tickers().map((t) => t.symbol)).toEqual(['NVDA', 'AAPL']);
  });
});

function sampleList(): TickerObservationIndex[] {
  return [
    { symbol: 'NVDA', snapshotCount: 12, lastGeneratedAt: '2026-05-13T10:00:00Z' },
    { symbol: 'AAPL', snapshotCount: 3, lastGeneratedAt: '2026-05-12T16:00:00Z' },
  ];
}
