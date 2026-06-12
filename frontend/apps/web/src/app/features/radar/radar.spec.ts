/**
 * Radar page after the post-pivot rework around the GUS entry checklist. The page juggles two
 * orthogonal axes — when to hit the provider (only on « Rechercher ») vs the fixed checklist filter
 * applied to every loaded snapshot. Tests pin the parts a refactor could blur:
 *
 * - **Init hydrates from /movers** — the persisted snapshot loads on init via GET, NOT the POST
 *   refresh (a regression calling refresh on init would re-burn the provider quota every page load).
 * - **« Rechercher » triggers POST /refresh** — the only path that calls the provider.
 * - **`filtered` applies the GUS checklist** — price $1–$10, gap ≥ +50 %. Float is NOT part of the
 *   filter anymore (the only free source is stale) — a row passes whatever its float.
 * - **DilutionTracker deep-link** — each row links out for the human float/dilution read.
 * - **« Add stat »** — confirm dialog → `createFromRadar` → success toast ; the in-flight row's
 *   button is disabled.
 * - **Empty states / error fallback** — `fetchedAt === null` → "press Rechercher"; rejects-only →
 *   "no GUS candidate"; failures keep previous data intact + a translated error.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  ScreenerRepository,
  ScreenerSnapshotResponse,
  TickerMover,
} from '../../core/api/screener/screener.repository';
import { RadarStatInput, StatEntry } from '../../core/api/stats/stat-entry.model';
import { StatsRepository } from '../../core/api/stats/stats.repository';
import { RadarPage } from './radar';

/** A clean GUS candidate — clears every machine-checkable criterion (price + gap). */
const gusMover: TickerMover = {
  symbol: 'GNS',
  name: 'Genius Group Ltd',
  price: 2.4,
  previousClose: 1.2,
  gapPct: 100,
  volume: 9_000_000,
  volumeAvg30d: 1_500_000,
  volumeRatio: 6,
  marketCapUsd: 29_000_000,
  exchange: 'NASDAQ',
  sector: 'Technology',
  floatShares: 12_000_000,
  premarketVolume: 800_000,
};

/** Price too high ($13.50 > $10) — must be filtered out by the checklist. */
const rejectMover: TickerMover = {
  ...gusMover,
  symbol: 'HUBC',
  price: 13.5,
  floatShares: 18_000_000,
};

const sampleEnvelope: ScreenerSnapshotResponse = {
  date: '2026-06-10',
  provider: 'mock',
  fetchedAt: '2026-06-10T14:32:00Z',
  movers: [gusMover],
};

const emptyEnvelope: ScreenerSnapshotResponse = {
  date: null,
  provider: 'mock',
  fetchedAt: null,
  movers: [],
};

class StubScreenerRepository {
  refresh = vi.fn<() => Observable<ScreenerSnapshotResponse>>(() => of(sampleEnvelope));
  loadSnapshot = vi.fn<(date?: string | null) => Observable<ScreenerSnapshotResponse>>(() =>
    of(sampleEnvelope),
  );
}

class StubStatsRepository {
  createFromRadar = vi.fn<(input: RadarStatInput) => Observable<StatEntry>>(() =>
    of({ id: 'new-stat' } as StatEntry),
  );
}

/** MatDialog stub — `open(...).afterClosed()` resolves to whatever the test wires. */
function dialogStub(afterClosed: Observable<boolean>) {
  return { open: vi.fn(() => ({ afterClosed: () => afterClosed })) };
}

describe('RadarPage', () => {
  let fixture: ComponentFixture<RadarPage>;
  let component: RadarPage;
  let screener: StubScreenerRepository;
  let stats: StubStatsRepository;
  let snackBar: { open: ReturnType<typeof vi.fn> };

  async function setup(
    opts: {
      initialLoad?: Observable<ScreenerSnapshotResponse>;
      dialogResult?: Observable<boolean>;
    } = {},
  ): Promise<void> {
    screener = new StubScreenerRepository();
    stats = new StubStatsRepository();
    snackBar = { open: vi.fn() };
    if (opts.initialLoad) screener.loadSnapshot.mockReturnValue(opts.initialLoad);

    await TestBed.configureTestingModule({
      imports: [RadarPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        { provide: ScreenerRepository, useValue: screener },
        { provide: StatsRepository, useValue: stats },
        { provide: MatDialog, useValue: dialogStub(opts.dialogResult ?? of(false)) },
        { provide: MatSnackBar, useValue: snackBar },
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
    expect(component.entries()).toEqual([gusMover]);
    expect(component.fetchedAt()).toBe('2026-06-10T14:32:00Z');
    expect(component.notYetFetched()).toBe(false);
  });

  it('keeps rows clearing price + gap and drops rows that fail a criterion', async () => {
    await setup({ initialLoad: of({ ...sampleEnvelope, movers: [gusMover, rejectMover] }) });

    expect(component.entries()).toEqual([gusMover, rejectMover]); // raw data unchanged
    expect(component.filtered()).toEqual([gusMover]); // HUBC ($13.50) filtered out
  });

  it('no longer filters on float — a row passes whatever its float value', async () => {
    // Float was dropped from the checklist (FMP float is stale). A float far outside the old
    // 3M–50M band must NOT get the row rejected anymore.
    const wildFloat: TickerMover = { ...gusMover, symbol: 'TOPS', floatShares: 900_000_000 };
    await setup({ initialLoad: of({ ...sampleEnvelope, movers: [wildFloat] }) });

    expect(component.filtered()).toEqual([wildFloat]);
  });

  it('shows the "no candidate" hint when the snapshot has only rejects', async () => {
    await setup({ initialLoad: of({ ...sampleEnvelope, movers: [rejectMover] }) });

    expect(component.filtered()).toEqual([]);
    expect(component.emptyAfterFilter()).toBe(true);
  });

  it('builds the DilutionTracker deep-link from the symbol', async () => {
    await setup();
    expect(component.dilutionUrl('GNS')).toBe('https://dilutiontracker.com/app/search/GNS');
  });

  it('« Add stat » confirmed → creates a stat from the row and toasts success', async () => {
    await setup({ dialogResult: of(true) });

    component.onAddStat(gusMover);
    await fixture.whenStable();

    expect(stats.createFromRadar).toHaveBeenCalledWith({
      ticker: 'GNS',
      gapUpPercent: 100,
      openPrice: 2.4,
    });
    expect(snackBar.open).toHaveBeenCalledTimes(1);
    expect(component.addingSymbol()).toBeNull();
  });

  it('« Add stat » cancelled → no create call, no toast', async () => {
    await setup({ dialogResult: of(false) });

    component.onAddStat(gusMover);
    await fixture.whenStable();

    expect(stats.createFromRadar).not.toHaveBeenCalled();
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('« Add stat » create failure → error toast, state reset', async () => {
    await setup({ dialogResult: of(true) });
    stats.createFromRadar.mockReturnValue(throwError(() => new Error('500')));

    component.onAddStat(gusMover);
    await fixture.whenStable();

    expect(snackBar.open).toHaveBeenCalledTimes(1);
    expect(component.addingSymbol()).toBeNull();
  });

  it('« Rechercher » triggers POST /refresh and updates entries + fetchedAt', async () => {
    await setup({ initialLoad: of(emptyEnvelope) });
    expect(component.notYetFetched()).toBe(true);

    component.onRefreshRequested();
    await fixture.whenStable();

    expect(screener.refresh).toHaveBeenCalledTimes(1);
    expect(component.entries()).toEqual([gusMover]);
    expect(component.fetchedAt()).toBe('2026-06-10T14:32:00Z');
    expect(component.notYetFetched()).toBe(false);
    expect(component.refreshing()).toBe(false);
  });

  it('surfaces a translated error and keeps the previous entries when refresh fails', async () => {
    await setup();
    expect(component.entries()).toEqual([gusMover]);

    screener.refresh.mockReturnValue(throwError(() => new Error('503')));
    component.onRefreshRequested();
    await fixture.whenStable();

    expect(component.error()).not.toBeNull();
    expect(component.entries()).toEqual([gusMover]); // previous snapshot stays visible
    expect(component.refreshing()).toBe(false);
  });

  it('renders the "not yet fetched" state when the initial envelope has fetchedAt null', async () => {
    await setup({ initialLoad: of(emptyEnvelope) });

    expect(component.notYetFetched()).toBe(true);
    expect(component.entries()).toEqual([]);
    expect(component.emptyAfterFilter()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('surfaces a translated error when the initial load fails', async () => {
    await setup({ initialLoad: throwError(() => new Error('boom')) });

    expect(component.error()).not.toBeNull();
    expect(component.entries()).toEqual([]);
    expect(component.notYetFetched()).toBe(true);
  });
});
