/**
 * Radar page after Phase 6 ticket (9). The page now juggles two orthogonal axes — when to hit the
 * provider (only on the « Rechercher » button) vs when to filter (every panel tweak, client-side).
 * Tests pin the parts a refactor could blur silently :
 *
 * - **Init hydrates from /movers** — the persisted snapshot loads on init via GET, NOT the
 *   POST refresh. A regression that called refresh on init would re-burn the provider quota every
 *   page load.
 * - **« Rechercher » triggers POST /refresh** — the only path that calls the provider.
 * - **Filter changes do NOT trigger any HTTP** — once a snapshot is loaded, panel tweaks operate
 *   purely on the in-memory `entries` signal. Burning quota on filter tweaks is the regression we
 *   ship this ticket to fix.
 * - **`filtered` reflects both `entries` and `filter`** — derived view, must recompute when either
 *   signal changes.
 * - **Empty envelope (`fetchedAt === null`) → "press Rechercher" hint** — distinct from "snapshot
 *   loaded but filter matches nothing".
 * - **Error fallback** — failures on init or refresh leave the previous data intact and surface a
 *   translated error.
 *
 * Repos are mocked with simple stubs ; HTTP wire format is verified separately in the http spec.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
  ScreenerRepository,
  ScreenerSnapshotResponse,
  TickerMover,
} from '../../core/api/screener/screener.repository';
import { ScreenerFilterRepository } from '../../core/local/screener-filter/screener-filter.repository';
import { RadarPage } from './radar';

const sampleMover: TickerMover = {
  symbol: 'RDDT',
  name: 'Reddit Inc.',
  price: 78.4,
  previousClose: 67.2,
  gapPct: 16.67,
  volume: 24_500_000,
  volumeAvg30d: 6_000_000,
  volumeRatio: 4.08,
  marketCapUsd: 9_800_000_000,
  exchange: 'NASDAQ',
  sector: 'Communication Services',
};

const sampleEnvelope: ScreenerSnapshotResponse = {
  date: '2026-05-29',
  provider: 'fmp',
  fetchedAt: '2026-05-29T14:32:00Z',
  movers: [sampleMover],
};

const emptyEnvelope: ScreenerSnapshotResponse = {
  date: null,
  provider: 'fmp',
  fetchedAt: null,
  movers: [],
};

class StubScreenerRepository {
  refresh = vi.fn<() => Observable<ScreenerSnapshotResponse>>(() => of(sampleEnvelope));
  loadSnapshot = vi.fn<(date?: string | null) => Observable<ScreenerSnapshotResponse>>(() =>
    of(sampleEnvelope),
  );
}

class StubScreenerFilterRepository {
  load = vi.fn<() => ScreenerFilter | null>(() => null);
  save = vi.fn<(f: ScreenerFilter) => void>();
}

describe('RadarPage', () => {
  let fixture: ComponentFixture<RadarPage>;
  let component: RadarPage;
  let screener: StubScreenerRepository;
  let storage: StubScreenerFilterRepository;

  async function setup(
    opts: {
      persistedFilter?: ScreenerFilter | null;
      initialLoad?: Observable<ScreenerSnapshotResponse>;
    } = {},
  ): Promise<void> {
    screener = new StubScreenerRepository();
    storage = new StubScreenerFilterRepository();
    storage.load.mockReturnValue(opts.persistedFilter ?? null);
    if (opts.initialLoad) screener.loadSnapshot.mockReturnValue(opts.initialLoad);

    await TestBed.configureTestingModule({
      imports: [RadarPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        { provide: ScreenerRepository, useValue: screener },
        { provide: ScreenerFilterRepository, useValue: storage },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RadarPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('loads the persisted snapshot via GET on init, not via refresh', async () => {
    await setup();

    expect(screener.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(screener.refresh).not.toHaveBeenCalled();
    expect(component.entries()).toEqual([sampleMover]);
    expect(component.fetchedAt()).toBe('2026-05-29T14:32:00Z');
    expect(component.notYetFetched()).toBe(false);
  });

  it('seeds the filter from local storage when a persisted value is present', async () => {
    // Filter is intentionally loose enough that `sampleMover` survives — the goal is to assert
    // the hydration path, not the filter predicate (covered by other tests).
    const persisted: ScreenerFilter = { gapPctMin: 10, volumeRatioMin: 3 };
    await setup({ persistedFilter: persisted });

    expect(component.filter()).toEqual(persisted);
    expect(component.filtered()).toEqual([sampleMover]);
  });

  it('falls back to DEFAULT_SCREENER_FILTER when nothing is persisted', async () => {
    await setup();
    expect(component.filter()).toEqual(DEFAULT_SCREENER_FILTER);
  });

  it('persists the filter on a panel change but does NOT hit the provider', async () => {
    // This is the core ticket (9) invariant — filter tweaks must not burn provider quota.
    await setup();
    screener.refresh.mockClear();
    screener.loadSnapshot.mockClear();

    const next: ScreenerFilter = { ...DEFAULT_SCREENER_FILTER, gapPctMin: 12 };
    component.onFilterChanged(next);
    await fixture.whenStable();

    expect(storage.save).toHaveBeenCalledWith(next);
    expect(component.filter()).toEqual(next);
    expect(screener.refresh).not.toHaveBeenCalled();
    expect(screener.loadSnapshot).not.toHaveBeenCalled();
  });

  it('recomputes filtered when the filter tightens past the in-memory data', async () => {
    await setup();
    expect(component.filtered()).toEqual([sampleMover]);

    // Tighten gap floor past the sample mover's 16.67 — it should drop out of the derived view.
    component.onFilterChanged({ ...DEFAULT_SCREENER_FILTER, gapPctMin: 50 });
    await fixture.whenStable();

    expect(component.entries()).toEqual([sampleMover]); // raw data unchanged
    expect(component.filtered()).toEqual([]); // derived view tightened
    expect(component.emptyAfterFilter()).toBe(true);
  });

  it('lets movers with volumeRatio=0 through regardless of the volume floor (FMP no-volume sentinel)', async () => {
    // FMP's gainers/losers endpoint doesn't expose volume — every mover comes through with
    // `volumeRatio = 0`. Without sentinel handling the radar would render empty for the default
    // FMP user even though the snapshot has data. Mock + Polygon emit a real volumeRatio so the
    // floor still applies to them.
    const fmpMover: TickerMover = { ...sampleMover, symbol: 'HUBC', volumeRatio: 0 };
    const envelope: ScreenerSnapshotResponse = {
      ...sampleEnvelope,
      movers: [fmpMover],
    };
    await setup({ initialLoad: of(envelope) });

    // Default volumeRatioMin is 3 — but the sentinel 0 must pass through anyway.
    expect(component.filter().volumeRatioMin).toBe(3);
    expect(component.filtered()).toEqual([fmpMover]);
  });

  it('reset restores DEFAULT_SCREENER_FILTER without re-hitting the provider', async () => {
    await setup({
      persistedFilter: { ...DEFAULT_SCREENER_FILTER, gapPctMin: 20 },
    });
    screener.refresh.mockClear();
    screener.loadSnapshot.mockClear();

    component.onResetRequested();
    await fixture.whenStable();

    expect(component.filter()).toEqual(DEFAULT_SCREENER_FILTER);
    expect(storage.save).toHaveBeenCalledWith(DEFAULT_SCREENER_FILTER);
    expect(screener.refresh).not.toHaveBeenCalled();
    expect(screener.loadSnapshot).not.toHaveBeenCalled();
  });

  it('« Rechercher » triggers POST /refresh and updates entries + fetchedAt', async () => {
    await setup({ initialLoad: of(emptyEnvelope) });
    expect(component.notYetFetched()).toBe(true);
    expect(component.refreshing()).toBe(false);

    component.onRefreshRequested();
    await fixture.whenStable();

    expect(screener.refresh).toHaveBeenCalledTimes(1);
    expect(component.entries()).toEqual([sampleMover]);
    expect(component.fetchedAt()).toBe('2026-05-29T14:32:00Z');
    expect(component.notYetFetched()).toBe(false);
    expect(component.refreshing()).toBe(false);
  });

  it('surfaces a translated error and keeps the previous entries when refresh fails', async () => {
    await setup();
    expect(component.entries()).toEqual([sampleMover]);

    screener.refresh.mockReturnValue(throwError(() => new Error('503')));
    component.onRefreshRequested();
    await fixture.whenStable();

    expect(component.error()).not.toBeNull();
    // Previous snapshot stays visible — the user keeps the data they already had.
    expect(component.entries()).toEqual([sampleMover]);
    expect(component.refreshing()).toBe(false);
  });

  it('renders the "not yet fetched" state when the initial load envelope has fetchedAt null', async () => {
    await setup({ initialLoad: of(emptyEnvelope) });

    expect(component.notYetFetched()).toBe(true);
    expect(component.entries()).toEqual([]);
    expect(component.emptyAfterFilter()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('surfaces a translated error and clears nothing when the initial load fails', async () => {
    await setup({ initialLoad: throwError(() => new Error('boom')) });

    expect(component.error()).not.toBeNull();
    expect(component.entries()).toEqual([]);
    expect(component.notYetFetched()).toBe(true);
  });
});
