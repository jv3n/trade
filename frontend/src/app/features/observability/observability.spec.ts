/**
 * Tests on [ObservabilityPage] — Phase 3 #1 « narrative vs price » timeline. The page is a thin
 * presentation layer over [NarrativeObservabilityRepository]. What we pin :
 *
 * - **On init, the page fires `findFor(symbol)`** with the symbol from the route param,
 *   uppercased. A user who navigates to `/observability/aapl` reaches the same endpoint as
 *   `/observability/AAPL` — keeps the backend cache key aligned.
 * - **Missing symbol in the URL** : the page renders the error banner instead of firing a
 *   bogus call with an empty path segment.
 * - **Empty-state branch** when the backend returns `observations: []` — the page shows the
 *   « no narrative yet » hint, not a partial mess.
 * - **Error banner** when the fetch fails — the user can retry without losing the page state.
 * - **Toggle / isExpanded contract** : clicking a card flips its expanded id, clicking it again
 *   collapses. Only one card open at a time. Pinned because the template binds to
 *   `isExpanded(id)` and a regression that returned true for every id would render all cards
 *   expanded at once.
 * - **`deltaClass` colour rules** : positive → up, negative → down, zero → zero, null → muted.
 *   Pinned at the component level so a future template refactor that branches on `>= 0` instead
 *   of `> 0` (which would classify zero as positive — wrong, a flat close isn't a win) gets
 *   caught.
 * - **`pricesAllUnavailable` heuristic** : flips true only when every observation has all 6
 *   price-since fields null. Surfaces the « upstream is down » banner ; an empty timeline does
 *   NOT trigger it (the heuristic requires at least one observation).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import {
  NarrativeObservabilityRepository,
  NarrativeObservation,
  NarrativeObservations,
} from '../../core/narrative-observability.repository';
import { ObservabilityPage } from './observability';

describe('ObservabilityPage', () => {
  let fixture: ComponentFixture<ObservabilityPage>;
  let component: ObservabilityPage;
  const findFor = vi.fn();
  let paramSymbol = 'NVDA';

  async function setup() {
    findFor.mockReset();
    await TestBed.configureTestingModule({
      imports: [ObservabilityPage],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: NarrativeObservabilityRepository,
          useValue: { findFor },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ symbol: paramSymbol }) } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ObservabilityPage);
    component = fixture.componentInstance;
  }

  // ---------------------------------------------------------------------- happy init

  it('fires findFor(uppercased symbol) on init and hydrates the timeline', async () => {
    paramSymbol = 'nvda'; // lowercase from URL — the page must uppercase before reading.
    await setup();
    findFor.mockReturnValue(of(response([observation()])));

    fixture.detectChanges();

    expect(findFor).toHaveBeenCalledWith('NVDA');
    expect(component.symbol()).toBe('NVDA');
    expect(component.observations().length).toBe(1);
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toBeNull();
    paramSymbol = 'NVDA'; // restore for sibling tests
  });

  // ---------------------------------------------------------------------- missing symbol

  it('renders an error and skips the fetch when the URL has no symbol', async () => {
    paramSymbol = '';
    await setup();

    fixture.detectChanges();

    expect(findFor).not.toHaveBeenCalled();
    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
    paramSymbol = 'NVDA';
  });

  // ---------------------------------------------------------------------- empty state

  it('flags isEmpty when the backend returns no observations', async () => {
    await setup();
    findFor.mockReturnValue(of(response([])));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    expect(component.observations()).toEqual([]);
    expect(component.loadError()).toBeNull();
  });

  it('isEmpty is false when at least one observation came back', async () => {
    await setup();
    findFor.mockReturnValue(of(response([observation()])));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(false);
  });

  // ---------------------------------------------------------------------- error banner

  it('shows a load-error banner when the fetch fails', async () => {
    await setup();
    findFor.mockReturnValue(throwError(() => new Error('503')));

    fixture.detectChanges();

    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
    // Pin we don't accidentally surface empty-state on an error — the user is owed a different
    // message (« retry » vs « no data yet »).
    expect(component.isEmpty()).toBe(false);
  });

  // ---------------------------------------------------------------------- expand / collapse

  it('toggle expands a card then collapses it on the second click', async () => {
    await setup();
    findFor.mockReturnValue(of(response([observation({ snapshotId: 'snap-1' })])));

    fixture.detectChanges();
    expect(component.isExpanded('snap-1')).toBe(false);

    component.toggle('snap-1');
    expect(component.isExpanded('snap-1')).toBe(true);

    component.toggle('snap-1');
    expect(component.isExpanded('snap-1')).toBe(false);
  });

  it('only one card stays expanded at a time (mutual exclusion)', async () => {
    // Pin the « accordion » contract — opening B closes A. The template renders a body for the
    // currently-expanded card only ; a regression that allowed concurrent expansions would
    // surprise the user with a long scroll of opened cards.
    await setup();
    findFor.mockReturnValue(
      of(response([observation({ snapshotId: 'snap-1' }), observation({ snapshotId: 'snap-2' })])),
    );

    fixture.detectChanges();

    component.toggle('snap-1');
    expect(component.isExpanded('snap-1')).toBe(true);
    expect(component.isExpanded('snap-2')).toBe(false);

    component.toggle('snap-2');
    expect(component.isExpanded('snap-1')).toBe(false);
    expect(component.isExpanded('snap-2')).toBe(true);
  });

  // ---------------------------------------------------------------------- delta class rules

  it('deltaClass returns delta-up / delta-down / delta-zero / delta-muted by sign of the value', async () => {
    await setup();
    findFor.mockReturnValue(of(response([])));
    fixture.detectChanges();

    expect(component.deltaClass(0.05)).toBe('delta-up');
    expect(component.deltaClass(-0.02)).toBe('delta-down');
    expect(component.deltaClass(0)).toBe('delta-zero');
    expect(component.deltaClass(null)).toBe('delta-muted');
  });

  // ---------------------------------------------------------------------- pricesAllUnavailable

  it('pricesAllUnavailable flips true when every observation has all 6 price-since fields null', async () => {
    await setup();
    findFor.mockReturnValue(
      of(
        response([
          observation({
            priceAt1d: null,
            priceAt1w: null,
            priceAt1m: null,
            delta1d: null,
            delta1w: null,
            delta1m: null,
          }),
        ]),
      ),
    );

    fixture.detectChanges();

    expect(component.pricesAllUnavailable()).toBe(true);
  });

  it('pricesAllUnavailable stays false when at least one observation has a delta', async () => {
    // Mixed timeline (some rows old enough to have deltas, some too recent). The « upstream
    // down » banner must NOT fire in that case — the cause is window-not-elapsed, not provider
    // outage.
    await setup();
    findFor.mockReturnValue(
      of(
        response([
          observation({ delta1d: 0.02, priceAt1d: 102 }),
          observation({ priceAt1d: null, delta1d: null, priceAt1w: null, delta1w: null }),
        ]),
      ),
    );

    fixture.detectChanges();

    expect(component.pricesAllUnavailable()).toBe(false);
  });

  it('pricesAllUnavailable stays false on an empty timeline', async () => {
    // Empty list and « all deltas null » should not be confused — the empty state has its own
    // banner. Pinned because the predicate uses `every()` which is vacuously true on `[]`.
    await setup();
    findFor.mockReturnValue(of(response([])));
    fixture.detectChanges();

    expect(component.pricesAllUnavailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------- factories

function observation(overrides: Partial<NarrativeObservation> = {}): NarrativeObservation {
  return {
    snapshotId: 'snap-default',
    symbol: 'NVDA',
    generatedAt: '2026-04-01T15:00:00Z',
    price: 100,
    summary: 'Price above MA200, RSI 62 — bullish posture.',
    sentiment: 'BULLISH',
    keyPoints: ['price above MA200', 'RSI 62 mid-bullish'],
    modelUsed: 'claude-haiku-4-5',
    promptVersion: 'v2',
    promptTemplateId: 'tmpl-1',
    promptName: 'narrative-default',
    promptTemplateVersion: 'v2',
    thumbsValue: 0,
    priceAt1d: 102,
    priceAt1w: 105,
    priceAt1m: 110,
    delta1d: 0.02,
    delta1w: 0.05,
    delta1m: 0.1,
    ...overrides,
  };
}

function response(observations: NarrativeObservation[]): NarrativeObservations {
  return { symbol: 'NVDA', observations };
}
