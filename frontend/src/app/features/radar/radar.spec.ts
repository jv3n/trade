/**
 * Tests on the radar page. Pin the orchestration logic — the parts a refactor could break
 * silently — rather than every signal-to-template pass-through :
 *
 * - **Hydration on init** — the persisted filter is loaded from local storage and used for the
 *   first fetch ; defaults kick in only when nothing is persisted.
 * - **Filter changes are persisted before the refetch** — a reload after a tweak must surface
 *   the same filter, not the previous one.
 * - **Reset path** — restores [DEFAULT_SCREENER_FILTER] both in-memory and in storage.
 * - **Error fallback** — an HTTP failure leaves the table empty and surfaces the translated
 *   error message ; the empty-state hint does NOT also render in that case.
 * - **Empty-state branching** — an empty 200 OK is distinct from an error : the empty hint
 *   shows, the error banner does not.
 *
 * Repos are mocked with simple stubs — the HTTP wire format is verified separately in
 * `core/api/screener/adapters/screener.http.spec.ts`.
 */
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { RadarPage } from './radar';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
  ScreenerRepository,
  TickerMover,
} from '../../core/api/screener/screener.repository';
import { ScreenerFilterRepository } from '../../core/local/screener-filter/screener-filter.repository';

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

class StubScreenerRepository {
  findMovers = vi.fn<(f: ScreenerFilter) => Observable<TickerMover[]>>(() => of([sampleMover]));
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

  async function setup(persistedFilter: ScreenerFilter | null = null): Promise<void> {
    screener = new StubScreenerRepository();
    storage = new StubScreenerFilterRepository();
    storage.load.mockReturnValue(persistedFilter);

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

  it('fetches with the default filter when nothing is persisted', async () => {
    await setup(null);

    expect(screener.findMovers).toHaveBeenCalledWith(DEFAULT_SCREENER_FILTER);
    expect(component.filter()).toEqual(DEFAULT_SCREENER_FILTER);
    expect(component.movers()).toEqual([sampleMover]);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('seeds the filter from local storage when a persisted value is present', async () => {
    const persisted: ScreenerFilter = {
      gapPctMin: 10,
      volumeRatioMin: 5,
      marketCapMin: 3_000_000_000,
      marketCapMax: 8_000_000_000,
      exchange: null,
      sector: 'Technology',
    };
    await setup(persisted);

    expect(screener.findMovers).toHaveBeenCalledWith(persisted);
    expect(component.filter()).toEqual(persisted);
  });

  it('persists the filter before refetching when the panel emits a change', async () => {
    await setup(null);
    screener.findMovers.mockClear();

    const next: ScreenerFilter = {
      ...DEFAULT_SCREENER_FILTER,
      gapPctMin: 12,
      sector: 'Healthcare',
    };
    component.onFilterChanged(next);
    await fixture.whenStable();

    expect(storage.save).toHaveBeenCalledWith(next);
    expect(screener.findMovers).toHaveBeenCalledWith(next);
    expect(component.filter()).toEqual(next);
  });

  it('restores the defaults on reset and persists them', async () => {
    const persisted: ScreenerFilter = {
      ...DEFAULT_SCREENER_FILTER,
      gapPctMin: 20,
      sector: 'Energy',
    };
    await setup(persisted);
    screener.findMovers.mockClear();

    component.onResetRequested();
    await fixture.whenStable();

    expect(component.filter()).toEqual(DEFAULT_SCREENER_FILTER);
    expect(storage.save).toHaveBeenCalledWith(DEFAULT_SCREENER_FILTER);
    expect(screener.findMovers).toHaveBeenCalledWith(DEFAULT_SCREENER_FILTER);
  });

  it('surfaces a translated error message and clears the table on HTTP failure', async () => {
    screener = new StubScreenerRepository();
    storage = new StubScreenerFilterRepository();
    storage.load.mockReturnValue(null);
    screener.findMovers.mockReturnValue(throwError(() => new Error('boom')));

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

    expect(component.error()).not.toBeNull();
    expect(component.movers()).toEqual([]);
    // Error and empty-state are mutually exclusive in the template — `isEmpty` returns false so
    // the empty hint doesn't pile up on top of the error banner.
    expect(component.isEmpty()).toBe(false);
  });

  it('flags the empty state when the backend returns an empty array', async () => {
    screener = new StubScreenerRepository();
    storage = new StubScreenerFilterRepository();
    storage.load.mockReturnValue(null);
    screener.findMovers.mockReturnValue(of<TickerMover[]>([]));

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

    expect(component.movers()).toEqual([]);
    expect(component.error()).toBeNull();
    expect(component.isEmpty()).toBe(true);
  });
});
