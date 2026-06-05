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
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import {
  NarrativeObservabilityRepository,
  NarrativeObservation,
  NarrativeObservations,
} from '../../core/api/analysis/narrative-observability.repository';
import { PromptRepository } from '../../core/api/analysis/prompt.repository';
import { ObservabilityPage } from './observability';

describe('ObservabilityPage', () => {
  let fixture: ComponentFixture<ObservabilityPage>;
  let component: ObservabilityPage;
  const findFor = vi.fn();
  const findTickers = vi.fn();
  const listPrompts = vi.fn();
  let paramSymbol = 'NVDA';

  async function setup() {
    findFor.mockReset();
    findTickers.mockReset();
    listPrompts.mockReset();
    listPrompts.mockReturnValue(of([])); // most tests don't care about the dropdown content
    await TestBed.configureTestingModule({
      imports: [ObservabilityPage],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: NarrativeObservabilityRepository,
          useValue: { findFor, findTickers },
        },
        {
          provide: PromptRepository,
          useValue: {
            list: listPrompts,
            get: vi.fn(),
            activate: vi.fn(),
            create: vi.fn(),
            getStats: vi.fn(),
          },
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

    // Init fires with no filter — the page only forwards a non-undefined filter object once
    // the user has set at least one filter via the bar.
    expect(findFor).toHaveBeenCalledWith('NVDA', undefined);
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

  // ---------------------------------------------------------------------- filters (PR3)

  it('loads the prompt versions for the dropdown on init', async () => {
    // The dropdown is populated from PromptRepository, not from the observability list itself.
    // Pin that the page fires `list('narrative-default')` (the conventional family name) on
    // init — a rename here would silently empty the dropdown.
    await setup();
    findFor.mockReturnValue(of(response([])));
    listPrompts.mockReturnValue(of([{ id: 't1', version: 'v2', isActive: true } as never]));

    fixture.detectChanges();

    expect(listPrompts).toHaveBeenCalledWith('narrative-default');
    expect(component.prompts().length).toBe(1);
  });

  it('thumbs chip filter narrows filteredObservations to matching votes', async () => {
    // Pin the client-side thumbs filter — 'all' is a pass-through, the numeric values match
    // `thumbsValue`. Snapshots with null thumbs are excluded by non-`all` filters (intentional :
    // « show me the 👎 votes » should not include the no-vote rows).
    await setup();
    findFor.mockReturnValue(
      of(
        response([
          observation({ snapshotId: 'up', thumbsValue: 1 }),
          observation({ snapshotId: 'down', thumbsValue: -1 }),
          observation({ snapshotId: 'neutral', thumbsValue: 0 }),
          observation({ snapshotId: 'novote', thumbsValue: null }),
        ]),
      ),
    );

    fixture.detectChanges();

    expect(component.filteredObservations().length).toBe(4);

    component.setThumbsFilter(1);
    expect(component.filteredObservations().map((o) => o.snapshotId)).toEqual(['up']);

    component.setThumbsFilter(-1);
    expect(component.filteredObservations().map((o) => o.snapshotId)).toEqual(['down']);

    component.setThumbsFilter(0);
    expect(component.filteredObservations().map((o) => o.snapshotId)).toEqual(['neutral']);

    component.setThumbsFilter('all');
    expect(component.filteredObservations().length).toBe(4);
  });

  it('isFilteredEmpty flips true when the thumbs filter hides every observation', async () => {
    // Distinct from `isEmpty` (« nothing in the DB ») — here the data exists but is filtered
    // out. The template renders a different message + a reset action.
    await setup();
    findFor.mockReturnValue(
      of(response([observation({ thumbsValue: 0 }), observation({ thumbsValue: 0 })])),
    );

    fixture.detectChanges();
    expect(component.isFilteredEmpty()).toBe(false);

    component.setThumbsFilter(1);
    expect(component.isFilteredEmpty()).toBe(true);
    expect(component.isEmpty()).toBe(false);
  });

  it('applyFilters re-fetches with from / to / promptId in the wire shape the backend expects', async () => {
    // Pin (a) the date-range translates to ISO instants at UTC midnight, (b) `to` is the *next*
    // day's midnight so the picked-day is inclusive (half-open interval matches the backend
    // contract `from inclusive, to exclusive`), (c) `promptId` flows through verbatim.
    await setup();
    findFor.mockReturnValue(of(response([])));
    fixture.detectChanges();

    component.fromDate.set('2026-04-01');
    component.toDate.set('2026-04-30');
    component.promptId.set('uuid-1');
    component.applyFilters();

    // The second call (the first was on init).
    const call = findFor.mock.calls[findFor.mock.calls.length - 1];
    expect(call[0]).toBe('NVDA');
    expect(call[1]).toEqual({
      from: '2026-04-01T00:00:00Z',
      to: '2026-05-01T00:00:00Z', // next day so April 30th is included
      promptId: 'uuid-1',
    });
  });

  it('applyFilters omits the filter object entirely when every filter is empty', async () => {
    // Pin that we don't send a `{ from: undefined, to: undefined, ... }` object — the adapter
    // would treat each `undefined` as « omit », but constructing the object signals intent.
    // The collapse-to-undefined keeps the call sites honest.
    await setup();
    findFor.mockReturnValue(of(response([])));
    fixture.detectChanges();

    findFor.mockClear();
    component.applyFilters();

    const call = findFor.mock.calls[0];
    expect(call[1]).toBeUndefined();
  });

  // ---------------------------------------------------------------------- coherence chip (Phase
  // 3 #2)

  it('renders the coherence chip with the verdict-specific class for HIGH', async () => {
    // Pin the colour wiring : `chip-coherence-high` is what the SCSS targets to paint the chip
    // red. A renamed verdict or a missed `.toLowerCase()` would silently fall back to the muted
    // `chip` defaults.
    await setup();
    findFor.mockReturnValue(
      of(
        response([
          observation({
            snapshotId: 'newest',
            coherence: {
              verdict: 'HIGH',
              sentimentChange: 'FLIPPED',
              keyPointsJaccard: 0.5,
              summaryLengthRatio: 1,
              priceMoveBetween: 0.001,
              previousSnapshotId: 'older',
              previousGeneratedAt: '2026-04-30T12:00:00Z',
            },
          }),
          observation({ snapshotId: 'older' }),
        ]),
      ),
    );

    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.chip-coherence');
    // Only the newest card carries a coherence (the oldest has no previous to compare).
    expect(chips.length).toBe(1);
    expect(chips[0].classList.contains('chip-coherence-high')).toBe(true);
  });

  it('does not render a coherence chip on cards whose coherence is null', async () => {
    // The oldest snapshot in the timeline has no chronologically-previous reference. The page
    // hides the chip there rather than rendering a placeholder — pinned because a regression
    // that tested truthiness on `obs.coherence?.verdict` (always truthy on the enum string) would
    // accidentally render an empty chip.
    await setup();
    findFor.mockReturnValue(
      of(response([observation({ coherence: null }), observation({ coherence: null })])),
    );

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.chip-coherence').length).toBe(0);
  });

  it('coherenceTooltip surfaces the three sub-measures plus the price move', async () => {
    // The user reads this tooltip to audit *why* the chip says HIGH. All three dimensions
    // (sentiment / shared keypoints / length) and the price excuse must be present — otherwise
    // a divergent narrative looks unjustified for no visible reason.
    //
    // We spy on `TranslateService.instant` rather than asserting on the rendered tooltip string :
    // ngx-translate without a loaded dictionary returns the bare key and *drops* params, so the
    // tooltip content only exposes the keys. The spy gives us exact visibility on what was
    // forwarded — pinned values (`25%`, `1.50`, `-3.40%`) catch a regression in the formatting
    // helpers without depending on locale loading inside Vitest.
    await setup();
    const ts = TestBed.inject(TranslateService);
    const spy = vi.spyOn(ts, 'instant');

    const tooltip = component.coherenceTooltip({
      verdict: 'WARN',
      sentimentChange: 'PARTIAL',
      keyPointsJaccard: 0.25,
      summaryLengthRatio: 1.5,
      priceMoveBetween: -0.034,
      previousSnapshotId: 'older',
      previousGeneratedAt: '2026-05-01T10:00:00Z',
    });

    expect(spy).toHaveBeenCalledWith('observabilityPage.coherence.tooltip.keyPoints', {
      percent: '25%',
    });
    expect(spy).toHaveBeenCalledWith('observabilityPage.coherence.tooltip.length', {
      ratio: '1.50',
    });
    expect(spy).toHaveBeenCalledWith('observabilityPage.coherence.tooltip.priceMove', {
      percent: '-3.40%',
    });
    expect(tooltip.split('\n').length).toBe(5); // title + sentiment + keypoints + length + price
  });

  it('coherenceTooltip falls back to "price unknown" when priceMoveBetween is null', async () => {
    // Defensive — `priceMoveBetween` is null only when the previous snapshot's price was zero or
    // negative (corruption guard). The tooltip must say so explicitly rather than rendering
    // `+NaN%` or an empty line.
    await setup();

    const tooltip = component.coherenceTooltip({
      verdict: 'OK',
      sentimentChange: 'SAME',
      keyPointsJaccard: 1,
      summaryLengthRatio: 1,
      priceMoveBetween: null,
      previousSnapshotId: 'older',
      previousGeneratedAt: '2026-05-01T10:00:00Z',
    });

    expect(tooltip).not.toContain('NaN');
    expect(tooltip).toContain('priceMoveUnknown');
  });

  it('hasActiveFilter flips true as soon as one filter is set, false after reset', async () => {
    await setup();
    findFor.mockReturnValue(of(response([])));
    fixture.detectChanges();

    expect(component.hasActiveFilter()).toBe(false);
    component.fromDate.set('2026-04-01');
    expect(component.hasActiveFilter()).toBe(true);

    component.resetFilters();
    expect(component.hasActiveFilter()).toBe(false);
    expect(component.fromDate()).toBe('');
    expect(component.toDate()).toBe('');
    expect(component.promptId()).toBe('');
    expect(component.thumbs()).toBe('all');
  });
});

// ---------------------------------------------------------------------- factories

// Monotonic counter so each `observation()` call gets a unique default `snapshotId` — Angular's
// `@for ... track obs.snapshotId` on the timeline would otherwise emit NG0955 when a test passes
// ≥ 2 observations without explicit IDs.
let _snapshotCounter = 0;

function observation(overrides: Partial<NarrativeObservation> = {}): NarrativeObservation {
  return {
    snapshotId: `snap-${++_snapshotCounter}`,
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
    coherence: null,
    ...overrides,
  };
}

function response(observations: NarrativeObservation[]): NarrativeObservations {
  return { symbol: 'NVDA', observations };
}
