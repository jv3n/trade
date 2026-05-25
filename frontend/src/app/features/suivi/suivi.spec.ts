/**
 * Tests on the Suivi page (snapshot timeline). Pins down the **batch grouping** logic — multiple
 * snapshots from the same CSV import (one per account) share a `batchId` UUID. The page must
 * group them visually so a single import is shown as one row that expands to its accounts.
 *
 * **Mock convention** — the port exposes inherited resource builders (`allResource`,
 * `positionsCache`) on the abstract class itself, so the mock must `extends SnapshotRepository`
 * via `useClass` (a plain `useValue` object would lose those builders). The mock only implements
 * the two abstract HTTP methods, and we drive the streams by swapping the source on the fly.
 *
 * What we pin :
 * - **Pure formatting** — `gainClass(value)` (zero counts as `positive` — breaking even is visually
 *   OK, not bad).
 * - **Batch grouping** — wired through `snapshots.value()` → `batches` computed.
 * - **Toggle batch** — flips collapsed state and the derived `expanded` view ; the `batch` we hold
 *   is a snapshot of the computed, so we re-read `batches()` after each toggle.
 * - **Per-snapshot positions** — `toggleSnapshot` sets the trigger, the port's `positionsCache`
 *   accumulates the fetched positions into a `Signal<Map<id, positions>>` (the accumulator effect
 *   lives on the port). Regression guard for the original missing-subscribe bug — the component
 *   used to build a `.pipe()` in its constructor without `.subscribe()`, so the map stayed empty.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { Suivi } from './suivi';
import {
  SnapshotRepository,
  SnapshotSummary,
  SnapshotPosition,
} from '../../core/api/portfolio/snapshot.repository';

const makeSummary = (overrides: Partial<SnapshotSummary> = {}): SnapshotSummary => ({
  id: 'snap-1',
  batchId: 'batch-1',
  portfolioId: 'p-1',
  portfolioName: 'CELI',
  importedAt: '2025-01-01T00:00:00Z',
  positionCount: 3,
  totalBookValueCad: 5000,
  ...overrides,
});

const makePosition = (overrides: Partial<SnapshotPosition> = {}): SnapshotPosition => ({
  ticker: 'AAPL',
  name: 'Apple Inc.',
  assetType: 'STOCK',
  quantity: 10,
  bookValueCad: 1500,
  marketValue: 1800,
  marketCurrency: 'USD',
  unrealizedGain: 300,
  gainCurrency: 'USD',
  ...overrides,
});

/**
 * Test double that extends the port so the inherited `allResource` / `positionsResource` builders
 * stay wired. We swap the source observables on the instance to drive test scenarios — the rxResource
 * itself doesn't care, it just calls our overridden methods on each fetch.
 */
class MockSnapshotRepository extends SnapshotRepository {
  allSource: () => Observable<SnapshotSummary[]> = () => of([]);
  positionsSource: (id: string) => Observable<SnapshotPosition[]> = () => of([]);

  getAll(): Observable<SnapshotSummary[]> {
    return this.allSource();
  }

  getPositions(snapshotId: string): Observable<SnapshotPosition[]> {
    return this.positionsSource(snapshotId);
  }
}

describe('Suivi', () => {
  let component: Suivi;
  let fixture: ComponentFixture<Suivi>;
  let mockRepository: MockSnapshotRepository;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Suivi],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService({ lang: 'en' }),
        { provide: SnapshotRepository, useClass: MockSnapshotRepository },
      ],
    }).compileComponents();

    mockRepository = TestBed.inject(SnapshotRepository) as MockSnapshotRepository;
    fixture = TestBed.createComponent(Suivi);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('gainClass returns positive for positive gain', () => {
    expect(component.gainClass(100)).toBe('positive');
    expect(component.gainClass(0)).toBe('positive');
  });

  it('gainClass returns negative for negative gain', () => {
    expect(component.gainClass(-50)).toBe('negative');
  });

  it('gainClass returns empty string for null', () => {
    expect(component.gainClass(null)).toBe('');
  });

  it('groups snapshots by batchId into batches', async () => {
    const summaries: SnapshotSummary[] = [
      makeSummary({ id: 's1', batchId: 'batch-A', portfolioName: 'CELI', totalBookValueCad: 3000 }),
      makeSummary({ id: 's2', batchId: 'batch-A', portfolioName: 'REER', totalBookValueCad: 2000 }),
      makeSummary({ id: 's3', batchId: 'batch-B', portfolioName: 'CELI', totalBookValueCad: 3200 }),
    ];
    mockRepository.allSource = () => of(summaries);

    fixture.detectChanges();
    await fixture.whenStable();

    const batches = component.batches();
    expect(batches.length).toBe(2);

    const batchA = batches.find((b) => b.batchId === 'batch-A')!;
    expect(batchA.snapshots.length).toBe(2);
    expect(batchA.totalBookValueCad).toBe(5000);

    const batchB = batches.find((b) => b.batchId === 'batch-B')!;
    expect(batchB.snapshots.length).toBe(1);
    expect(batchB.totalBookValueCad).toBe(3200);
  });

  it('toggleBatch flips expanded state through the derived collapsed signal', async () => {
    mockRepository.allSource = () => of([makeSummary({ batchId: 'batch-X' })]);
    fixture.detectChanges();
    await fixture.whenStable();

    // `batches()` is a computed — we re-read it after each toggle to see the freshly derived
    // `expanded` flag (the value held in a local would go stale immediately).
    expect(component.batches()[0].expanded).toBe(true);

    component.toggleBatch('batch-X');
    expect(component.batches()[0].expanded).toBe(false);

    component.toggleBatch('batch-X');
    expect(component.batches()[0].expanded).toBe(true);
  });

  it('toggleSnapshot adds and removes from expandedSnapshots', () => {
    fixture.detectChanges();
    expect(component.isSnapshotExpanded('s1')).toBe(false);
    component.toggleSnapshot('s1');
    expect(component.isSnapshotExpanded('s1')).toBe(true);
    component.toggleSnapshot('s1');
    expect(component.isSnapshotExpanded('s1')).toBe(false);
  });

  it('getPositions returns empty array before loading', () => {
    fixture.detectChanges();
    expect(component.getPositions('unknown')).toEqual([]);
  });

  it('accumulates positions per snapshot id when toggleSnapshot triggers the resource', async () => {
    // Regression guard against the original bug : the constructor used to build a pipe via
    // `toObservable(positionsResource.value).pipe(...)` without `.subscribe()`, so the positions
    // map stayed empty and the expanded card showed nothing. The port's `positionsCache` builder
    // now owns the accumulator effect — we drive two different ids and check both land in the
    // cache reachable via `getPositions(id)`.
    const positionsBySymbol: Record<string, SnapshotPosition[]> = {
      s1: [makePosition({ ticker: 'AAPL' })],
      s2: [makePosition({ ticker: 'NVDA' }), makePosition({ ticker: 'MSFT' })],
    };
    mockRepository.positionsSource = (id) => of(positionsBySymbol[id] ?? []);

    fixture.detectChanges();
    await fixture.whenStable();

    component.toggleSnapshot('s1');
    await fixture.whenStable();
    expect(component.getPositions('s1').map((p) => p.ticker)).toEqual(['AAPL']);

    component.toggleSnapshot('s2');
    await fixture.whenStable();
    expect(component.getPositions('s2').map((p) => p.ticker)).toEqual(['NVDA', 'MSFT']);

    // Cache hit — the previously-fetched 's1' positions stay accessible alongside 's2'.
    expect(component.getPositions('s1').map((p) => p.ticker)).toEqual(['AAPL']);
  });

  it('does not re-trigger the fetch when the cached positions are already present', async () => {
    let fetchCount = 0;
    mockRepository.positionsSource = (id) => {
      fetchCount += 1;
      return of([makePosition({ ticker: `cached-${id}` })]);
    };

    fixture.detectChanges();
    await fixture.whenStable();

    component.toggleSnapshot('s1');
    await fixture.whenStable();
    expect(fetchCount).toBe(1);

    // Collapse then re-expand — the positions are already cached, the trigger must stay quiet.
    component.toggleSnapshot('s1');
    component.toggleSnapshot('s1');
    await fixture.whenStable();
    expect(fetchCount).toBe(1);
  });

  it('shows error message on load failure', async () => {
    mockRepository.allSource = () => throwError(() => new Error('network'));
    fixture.detectChanges();
    await fixture.whenStable();

    // No translations loaded in tests → TranslateService.instant returns the key as fallback,
    // which is still informative ("suivi.loadError"). Check the key path here.
    expect(component.error()).toBe('suivi.loadError');
  });
});
