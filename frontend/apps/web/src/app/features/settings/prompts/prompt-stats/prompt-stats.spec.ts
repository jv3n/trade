/**
 * Tests on [PromptStatsPage] — Phase 3 PR6 per-prompt stats view. The page is a thin
 * presentation layer over `PromptRepository.get + getStats`. What we pin :
 *
 * - **Both endpoints fire on init** — the page can't render without the template (header label)
 *   AND the stats (body). Pin the parallel fetch contract so a future tweak that drops one
 *   surfaces in CI rather than as an empty page.
 * - **Empty-state branch** when `totalRuns === 0` — the backend returns a zero-shape DTO, the
 *   page shows the empty hint instead of zero-filled KPIs that suggest activity.
 * - **Load-error banner** when either fetch fails — the page degrades to a single banner rather
 *   than rendering a partial mess.
 * - **Sparkline computation** : the `latencyPolyline` computed yields a non-empty `polyline`
 *   string when at least 2 days have latency data, and `null` when there's less than that. The
 *   computed handles the data-shape edge cases without leaking into the template.
 * - **Thumbs segment percentages** : `thumbsSegmentPct(...)` returns a 0..100 number that sums
 *   to 100 across `up + neutral + down` (modulo float precision). A future regression that
 *   forgets to divide by `totalRuns` would surface here.
 * - **Thumbs balance** : `up - down`. Zero when no votes. Surfaces sign for the KPI color.
 * - **Missing id in the URL** : the page renders a clear error banner rather than firing a
 *   bogus API call on an empty string.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import {
  PromptRepository,
  PromptStats,
  PromptTemplate,
} from '../../../../core/api/analysis/prompt.repository';
import { PromptStatsPage } from './prompt-stats';

describe('PromptStatsPage', () => {
  let fixture: ComponentFixture<PromptStatsPage>;
  let component: PromptStatsPage;
  const get = vi.fn();
  const getStats = vi.fn();
  let paramId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  async function setup() {
    get.mockReset();
    getStats.mockReset();
    await TestBed.configureTestingModule({
      imports: [PromptStatsPage],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        {
          provide: PromptRepository,
          useValue: {
            list: vi.fn(),
            activate: vi.fn(),
            create: vi.fn(),
            get,
            getStats,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: paramId }) } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PromptStatsPage);
    component = fixture.componentInstance;
  }

  // ---------------------------------------------------------------------- parallel fetch

  it('fires get(id) AND getStats(id) on init', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(populatedStats()));

    fixture.detectChanges();

    expect(get).toHaveBeenCalledWith(paramId);
    expect(getStats).toHaveBeenCalledWith(paramId);
    expect(component.template()?.version).toBe('v3');
    expect(component.stats()?.totalRuns).toBe(17);
    expect(component.loading()).toBe(false);
    expect(component.loadError()).toBeNull();
  });

  // ---------------------------------------------------------------------- empty / populated

  it('flags isEmpty when stats arrive with totalRuns=0', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(emptyStats()));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    expect(component.stats()?.totalRuns).toBe(0);
  });

  it('isEmpty is false on populated stats', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(populatedStats()));

    fixture.detectChanges();

    expect(component.isEmpty()).toBe(false);
  });

  // ---------------------------------------------------------------------- error banner

  it('shows a load-error banner when the stats fetch fails', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(throwError(() => new Error('500')));

    fixture.detectChanges();

    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
  });

  it('shows a load-error banner when the template fetch fails', async () => {
    await setup();
    get.mockReturnValue(throwError(() => new Error('404')));
    getStats.mockReturnValue(of(populatedStats()));

    fixture.detectChanges();

    expect(component.loadError()).not.toBeNull();
  });

  // ---------------------------------------------------------------------- missing id

  it('renders a clear error and skips the fetch when the URL has no id', async () => {
    paramId = '';
    await setup();

    fixture.detectChanges();

    expect(get).not.toHaveBeenCalled();
    expect(getStats).not.toHaveBeenCalled();
    expect(component.loadError()).not.toBeNull();
    expect(component.loading()).toBe(false);
    paramId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // restore for sibling tests
  });

  // ---------------------------------------------------------------------- latency polyline

  it('latencyPolyline returns null when fewer than 2 days have latency data', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(
      of({
        ...populatedStats(),
        daily: [
          {
            day: '2026-05-10',
            runs: 4,
            latencyP50Ms: 4_000,
            thumbsUp: 1,
            thumbsDown: 0,
          },
        ],
      }),
    );

    fixture.detectChanges();

    expect(component.latencyPolyline()).toBeNull();
  });

  it('latencyPolyline returns a non-empty string when ≥ 2 days have latency data', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(populatedStats()));

    fixture.detectChanges();

    const poly = component.latencyPolyline();
    expect(poly).not.toBeNull();
    // 2 points = 2 "x,y" pairs separated by a space.
    expect(poly!.split(' ').length).toBe(2);
  });

  // ---------------------------------------------------------------------- thumbs helpers

  it('thumbsSegmentPct sums to 100 across up/neutral/down on populated stats', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(populatedStats()));

    fixture.detectChanges();

    const total =
      component.thumbsSegmentPct('up') +
      component.thumbsSegmentPct('neutral') +
      component.thumbsSegmentPct('down');
    expect(total).toBeCloseTo(100, 5);
  });

  it('thumbsSegmentPct returns 0 across the board when no runs exist', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(emptyStats()));

    fixture.detectChanges();

    expect(component.thumbsSegmentPct('up')).toBe(0);
    expect(component.thumbsSegmentPct('neutral')).toBe(0);
    expect(component.thumbsSegmentPct('down')).toBe(0);
  });

  it('thumbsBalance returns up minus down', async () => {
    await setup();
    get.mockReturnValue(of(activeTemplate()));
    getStats.mockReturnValue(of(populatedStats()));

    fixture.detectChanges();

    // populatedStats : up=8, down=2 → 6
    expect(component.thumbsBalance()).toBe(6);
  });

  // ---------------------------------------------------------------------- helpers

  function activeTemplate(): PromptTemplate {
    return {
      id: paramId,
      name: 'narrative-default',
      version: 'v3',
      systemPrompt: 'Body',
      userTemplate: null,
      targetModel: null,
      isActive: true,
      createdAt: '2026-05-09T10:00:00Z',
      activatedAt: '2026-05-09T10:00:00Z',
      deprecatedAt: null,
      notes: null,
    };
  }

  function emptyStats(): PromptStats {
    return {
      promptTemplateId: paramId,
      totalRuns: 0,
      latencyP50Ms: null,
      latencyP95Ms: null,
      retryRate: 0,
      parseFailedRate: 0,
      validatorFailedRate: 0,
      thumbs: { up: 0, down: 0, neutral: 0 },
      daily: [],
    };
  }

  function populatedStats(): PromptStats {
    return {
      promptTemplateId: paramId,
      totalRuns: 17,
      latencyP50Ms: 4_200,
      latencyP95Ms: 12_300,
      retryRate: 0.12,
      parseFailedRate: 0.06,
      validatorFailedRate: 0.18,
      thumbs: { up: 8, down: 2, neutral: 7 },
      daily: [
        { day: '2026-05-10', runs: 5, latencyP50Ms: 3_900, thumbsUp: 3, thumbsDown: 0 },
        { day: '2026-05-09', runs: 12, latencyP50Ms: 4_300, thumbsUp: 5, thumbsDown: 2 },
      ],
    };
  }
});
