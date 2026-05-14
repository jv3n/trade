/**
 * Tests on [BiasPage] — Phase 3 #3 « narrative bias dashboard ». The page is a thin
 * presentation layer over [NarrativeBiasRepository] ; the bias *math* lives on the backend, so
 * what we pin here is the wiring + the rendering rules :
 *
 * - **On init the page fires `findBias(undefined)`** (no filter). The dropdown loads in parallel
 *   from `PromptRepository.list('narrative-default')`.
 * - **Empty state** : `snapshotsConsidered: 0` flips `isEmpty` and renders the « pas assez de
 *   données » hint, NOT the four cards (otherwise we'd render four empty charts).
 * - **Bias flag chip** is rendered when the response carries one, hidden when it's null.
 * - **`deltaClass` rules** : positive → up, negative → down, zero → zero, null → muted. Same
 *   pattern as the timeline page's deltaClass.
 * - **`thumbsBarWidth`** scales segments against the largest bucket so the three sentiment bars
 *   share an x-axis. Empty corpus returns 0 (Math.max would otherwise NaN on `[]`).
 * - **`applyFilters` re-fetches with the wire-shape the backend expects** : date range translated
 *   to ISO instants at UTC midnight, `to` extended J+1 to make the picked day inclusive.
 * - **`applyFilters` collapses to undefined** when every filter is empty — the adapter sends no
 *   query params at all.
 * - **`hasActiveFilter`** flips true as soon as one filter is set, false after reset.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { NarrativeBias, NarrativeBiasRepository } from '../../../core/narrative-bias.repository';
import { PromptRepository } from '../../../core/prompt.repository';
import { BiasPage } from './bias';

describe('BiasPage', () => {
  let fixture: ComponentFixture<BiasPage>;
  let component: BiasPage;
  const findBias = vi.fn();
  const listPrompts = vi.fn();

  async function setup() {
    findBias.mockReset();
    listPrompts.mockReset();
    listPrompts.mockReturnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [BiasPage],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        { provide: NarrativeBiasRepository, useValue: { findBias } },
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
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BiasPage);
    component = fixture.componentInstance;
  }

  // ---------------------------------------------------------------------- init

  it('fires findBias(undefined) on init and hydrates the dashboard', async () => {
    await setup();
    findBias.mockReturnValue(of(populatedBias()));

    fixture.detectChanges();

    expect(findBias).toHaveBeenCalledWith(undefined);
    expect(component.bias()).not.toBeNull();
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toBeNull();
  });

  it('loads the prompt versions for the dropdown on init', async () => {
    await setup();
    findBias.mockReturnValue(of(emptyBias()));
    listPrompts.mockReturnValue(of([{ id: 't1', version: 'v2', isActive: true } as never]));

    fixture.detectChanges();

    expect(listPrompts).toHaveBeenCalledWith('narrative-default');
    expect(component.prompts().length).toBe(1);
  });

  // ---------------------------------------------------------------------- empty state

  it('flips isEmpty when the backend returns snapshotsConsidered=0', async () => {
    // Pin the page-level distinction between « load failed » and « load OK + empty corpus ». The
    // empty-state hint surfaces only on the latter.
    await setup();
    findBias.mockReturnValue(of(emptyBias()));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    expect(component.loadError()).toBeNull();
  });

  it('isEmpty is false on a populated response', async () => {
    await setup();
    findBias.mockReturnValue(of(populatedBias()));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(false);
  });

  // ---------------------------------------------------------------------- error banner

  it('shows a load-error banner when the fetch fails', async () => {
    await setup();
    findBias.mockReturnValue(throwError(() => new Error('503')));

    fixture.detectChanges();

    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
    expect(component.isEmpty()).toBe(false);
  });

  // ---------------------------------------------------------------------- bias flag

  it('renders the bias-flag chip when the response carries one', async () => {
    // Pin the chip is conditional on the flag — a regression that always rendered would scare
    // the user with a false alarm on a balanced corpus.
    await setup();
    findBias.mockReturnValue(of(populatedBias({ withBiasFlag: true })));

    fixture.detectChanges();

    const flag = fixture.nativeElement.querySelector('.bias-flag');
    expect(flag).not.toBeNull();
  });

  it('omits the bias-flag chip when the response biasFlag is null', async () => {
    await setup();
    findBias.mockReturnValue(of(populatedBias({ withBiasFlag: false })));

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bias-flag')).toBeNull();
  });

  // ---------------------------------------------------------------------- helpers

  it('deltaClass returns delta-up / delta-down / delta-zero / delta-muted by sign of the value', async () => {
    await setup();
    findBias.mockReturnValue(of(emptyBias()));
    fixture.detectChanges();

    expect(component.deltaClass(0.05)).toBe('delta-up');
    expect(component.deltaClass(-0.02)).toBe('delta-down');
    expect(component.deltaClass(0)).toBe('delta-zero');
    expect(component.deltaClass(null)).toBe('delta-muted');
  });

  it('thumbsBarWidth scales segments against the largest bucket across sentiments', async () => {
    // Pin the cross-sentiment normalisation : if BULLISH bucket totals 100 and BEARISH bucket
    // totals 20, BEARISH thumbs-up of 10 should render at 10 % width (10/100), not 50 % (10/20).
    // Otherwise the eye lies — small buckets would look as full as the dominant one.
    await setup();
    findBias.mockReturnValue(
      of({
        ...emptyBias(),
        snapshotsConsidered: 120,
        thumbsDistribution: [
          {
            sentiment: 'BULLISH',
            thumbsUp: 80,
            thumbsNeutral: 20,
            thumbsDown: 0,
            noVote: 0,
          }, // total 100
          {
            sentiment: 'NEUTRAL',
            thumbsUp: 5,
            thumbsNeutral: 5,
            thumbsDown: 0,
            noVote: 0,
          },
          {
            sentiment: 'BEARISH',
            thumbsUp: 10,
            thumbsNeutral: 0,
            thumbsDown: 10,
            noVote: 0,
          }, // total 20
        ],
      }),
    );

    fixture.detectChanges();

    expect(component.maxThumbsTotal()).toBe(100);
    expect(component.thumbsBarWidth(80)).toBe(80); // BULLISH up vs max 100 = 80 %
    expect(component.thumbsBarWidth(10)).toBe(10); // BEARISH up vs max 100 = 10 %
  });

  it('thumbsBarWidth returns 0 on an empty corpus (no Math.max NaN)', async () => {
    // Math.max on an empty list returns -Infinity ; we guard via Math.max(0, ...). Pin so a
    // refactor that drops the seed surfaces here instead of NaN-ing the bar widths in prod.
    await setup();
    findBias.mockReturnValue(of(emptyBias()));
    fixture.detectChanges();

    expect(component.maxThumbsTotal()).toBe(0);
    expect(component.thumbsBarWidth(5)).toBe(0);
  });

  // ---------------------------------------------------------------------- filters

  it('applyFilters re-fetches with from / to / promptId in the wire shape the backend expects', async () => {
    // Same translation as the observability timeline : YYYY-MM-DD pickers → ISO instants at UTC
    // midnight, `to` shifted to J+1 so the picked day is inclusive (half-open interval matching
    // the backend's `from inclusive, to exclusive` contract).
    await setup();
    findBias.mockReturnValue(of(emptyBias()));
    fixture.detectChanges();

    component.fromDate.set('2026-04-01');
    component.toDate.set('2026-04-30');
    component.promptId.set('uuid-1');
    component.applyFilters();

    const call = findBias.mock.calls[findBias.mock.calls.length - 1];
    expect(call[0]).toEqual({
      from: '2026-04-01T00:00:00Z',
      to: '2026-05-01T00:00:00Z',
      promptId: 'uuid-1',
    });
  });

  it('applyFilters collapses to undefined when every filter is empty', async () => {
    await setup();
    findBias.mockReturnValue(of(emptyBias()));
    fixture.detectChanges();

    findBias.mockClear();
    component.applyFilters();

    expect(findBias.mock.calls[0][0]).toBeUndefined();
  });

  it('hasActiveFilter flips true after a filter is set, false after reset', async () => {
    await setup();
    findBias.mockReturnValue(of(emptyBias()));
    fixture.detectChanges();

    expect(component.hasActiveFilter()).toBe(false);
    component.fromDate.set('2026-04-01');
    expect(component.hasActiveFilter()).toBe(true);

    component.resetFilters();
    expect(component.hasActiveFilter()).toBe(false);
    expect(component.fromDate()).toBe('');
    expect(component.toDate()).toBe('');
    expect(component.promptId()).toBe('');
  });
});

// ---------------------------------------------------------------------- factories

function emptyBias(): NarrativeBias {
  return {
    snapshotsConsidered: 0,
    sentimentDistribution: {
      total: 0,
      buckets: [
        { sentiment: 'BULLISH', count: 0, percent: 0 },
        { sentiment: 'NEUTRAL', count: 0, percent: 0 },
        { sentiment: 'BEARISH', count: 0, percent: 0 },
      ],
      biasFlag: null,
    },
    calibration: [
      {
        sentiment: 'BULLISH',
        snapshotsTotal: 0,
        snapshotsWithDelta1d: 0,
        snapshotsWithDelta1w: 0,
        snapshotsWithDelta1m: 0,
        avgDelta1d: null,
        avgDelta1w: null,
        avgDelta1m: null,
      },
      {
        sentiment: 'NEUTRAL',
        snapshotsTotal: 0,
        snapshotsWithDelta1d: 0,
        snapshotsWithDelta1w: 0,
        snapshotsWithDelta1m: 0,
        avgDelta1d: null,
        avgDelta1w: null,
        avgDelta1m: null,
      },
      {
        sentiment: 'BEARISH',
        snapshotsTotal: 0,
        snapshotsWithDelta1d: 0,
        snapshotsWithDelta1w: 0,
        snapshotsWithDelta1m: 0,
        avgDelta1d: null,
        avgDelta1w: null,
        avgDelta1m: null,
      },
    ],
    topicCoverage: { snapshotsTotal: 0, topics: [] },
    thumbsDistribution: [],
  };
}

function populatedBias(opts: { withBiasFlag?: boolean } = {}): NarrativeBias {
  return {
    snapshotsConsidered: 47,
    sentimentDistribution: {
      total: 47,
      buckets: [
        { sentiment: 'BULLISH', count: 32, percent: 0.6809 },
        { sentiment: 'NEUTRAL', count: 10, percent: 0.2128 },
        { sentiment: 'BEARISH', count: 5, percent: 0.1064 },
      ],
      biasFlag:
        opts.withBiasFlag !== false
          ? { sentiment: 'BULLISH', percent: 0.6809, threshold: 0.6 }
          : null,
    },
    calibration: [
      {
        sentiment: 'BULLISH',
        snapshotsTotal: 32,
        snapshotsWithDelta1d: 28,
        snapshotsWithDelta1w: 25,
        snapshotsWithDelta1m: 18,
        avgDelta1d: 0.0123,
        avgDelta1w: 0.0245,
        avgDelta1m: 0.041,
      },
      {
        sentiment: 'NEUTRAL',
        snapshotsTotal: 10,
        snapshotsWithDelta1d: 8,
        snapshotsWithDelta1w: 7,
        snapshotsWithDelta1m: 5,
        avgDelta1d: 0.001,
        avgDelta1w: -0.005,
        avgDelta1m: 0.012,
      },
      {
        sentiment: 'BEARISH',
        snapshotsTotal: 5,
        snapshotsWithDelta1d: 4,
        snapshotsWithDelta1w: 3,
        snapshotsWithDelta1m: 2,
        avgDelta1d: -0.012,
        avgDelta1w: -0.024,
        avgDelta1m: -0.041,
      },
    ],
    topicCoverage: {
      snapshotsTotal: 47,
      topics: [
        { topic: 'rsi', count: 38, percent: 0.8085 },
        { topic: 'ma200', count: 31, percent: 0.6596 },
        { topic: 'momentum', count: 22, percent: 0.4681 },
      ],
    },
    thumbsDistribution: [
      { sentiment: 'BULLISH', thumbsUp: 12, thumbsNeutral: 18, thumbsDown: 2, noVote: 0 },
      { sentiment: 'NEUTRAL', thumbsUp: 1, thumbsNeutral: 8, thumbsDown: 1, noVote: 0 },
      { sentiment: 'BEARISH', thumbsUp: 0, thumbsNeutral: 4, thumbsDown: 1, noVote: 0 },
    ],
  };
}
