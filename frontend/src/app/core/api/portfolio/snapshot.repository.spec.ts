/**
 * Tests on the abstract [SnapshotRepository] port — pin the `allResource()` /
 * `positionsCache(trigger)` builders that live on the class itself rather than on each adapter.
 * The pilot for the "Resource builders on the port" convention shipped on this repository
 * (2026-05-16) ; the generalisation to the 13 other repositories will copy the pattern, so
 * the contract pinned here doubles as a reference for the future migrations.
 *
 * What we pin :
 * - **`allResource()` calls `getAll()` once on subscribe**, returns the data via `resource.value()`.
 * - **`positionsCache(trigger)` is idle when the trigger is `undefined`** — no fetch is fired,
 *   the cache stays empty. Symmetric with how rxResource treats undefined params.
 * - **`positionsCache(trigger)` accumulates** — toggling the trigger across distinct ids grows
 *   the returned map instead of replacing the previous value.
 * - **No re-fetch on the same trigger value twice in a row** — pinned because rxResource's
 *   params-equality short-circuit is what keeps the dashboard from re-fetching on every keypress
 *   when a derived trigger emits the same value.
 * - **`assertInInjectionContext` guard** — both builders throw loudly when called outside an
 *   injection context, defending against a future generalisation to the 13 other repositories
 *   that forgets the contract. Without this guard `effect()` would leak its cleanup until JS
 *   heap shutdown.
 */
import { TestBed } from '@angular/core/testing';
import { ApplicationRef, Signal, provideZonelessChangeDetection, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SnapshotPosition, SnapshotRepository, SnapshotSummary } from './snapshot.repository';

/**
 * Test double that extends the port so the inherited builders stay wired (a `useValue` plain
 * object would lose them). Swap `allSource` / `positionsSource` on the instance to drive each
 * scenario without re-configuring the TestBed.
 */
class FakeSnapshotRepository extends SnapshotRepository {
  allSource: () => Observable<SnapshotSummary[]> = () => of([]);
  positionsSource: (id: string) => Observable<SnapshotPosition[]> = () => of([]);

  getAll(): Observable<SnapshotSummary[]> {
    return this.allSource();
  }

  getPositions(snapshotId: string): Observable<SnapshotPosition[]> {
    return this.positionsSource(snapshotId);
  }
}

function makeSummary(overrides: Partial<SnapshotSummary> = {}): SnapshotSummary {
  return {
    id: 'snap-1',
    batchId: 'batch-1',
    portfolioId: 'pf-1',
    portfolioName: 'Demo',
    importedAt: '2026-04-01T00:00:00Z',
    positionCount: 3,
    totalBookValueCad: 1000,
    ...overrides,
  };
}

function makePosition(overrides: Partial<SnapshotPosition> = {}): SnapshotPosition {
  return {
    ticker: 'NVDA',
    name: 'NVIDIA',
    assetType: 'STOCK',
    quantity: 10,
    bookValueCad: 1000,
    marketValue: 1200,
    marketCurrency: 'USD',
    unrealizedGain: 200,
    gainCurrency: 'USD',
    ...overrides,
  };
}

describe('SnapshotRepository builders', () => {
  let repo: FakeSnapshotRepository;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SnapshotRepository, useClass: FakeSnapshotRepository },
      ],
    }).compileComponents();
    repo = TestBed.inject(SnapshotRepository) as FakeSnapshotRepository;
  });

  describe('allResource', () => {
    it('subscribes to getAll() and surfaces the data via resource.value()', async () => {
      const summaries = [makeSummary({ id: 'snap-A' }), makeSummary({ id: 'snap-B' })];
      repo.allSource = () => of(summaries);

      const resource = TestBed.runInInjectionContext(() => repo.allResource());
      // `rxResource` defers its initial subscribe to the next change-detection tick ; in a
      // zoneless test the synchronous `of(...)` source still emits **inside** an effect that
      // doesn't run until `ApplicationRef.whenStable()` resolves.
      await TestBed.inject(ApplicationRef).whenStable();

      expect(resource.value()).toEqual(summaries);
    });

    it('throws synchronously when called outside an injection context', () => {
      // Calling the builder from the bare `describe` block (outside any DI scope) must trip the
      // guard — without it, `rxResource` would silently capture an orphaned DestroyRef.
      expect(() => repo.allResource()).toThrow();
    });
  });

  describe('positionsCache', () => {
    it('stays idle while the trigger is undefined — no fetch fired', () => {
      const calls: string[] = [];
      repo.positionsSource = (id) => {
        calls.push(id);
        return of([makePosition({ ticker: id })]);
      };
      const trigger = signal<string | undefined>(undefined);

      const cache = TestBed.runInInjectionContext(() => repo.positionsCache(trigger));
      // No `await whenStable()` here — when `trigger()` is `undefined`, `rxResource` never
      // subscribes to the stream, so there's nothing async to flush. Adding a `whenStable()` call
      // would be redundant and might mask the « truly idle » intent of this scenario.

      expect(calls).toEqual([]);
      expect(cache().size).toBe(0);
    });

    it('populates the cache map when the trigger emits an id', async () => {
      repo.positionsSource = (id) => of([makePosition({ ticker: `${id}-pos` })]);
      const trigger = signal<string | undefined>('snap-A');

      const cache = TestBed.runInInjectionContext(() => repo.positionsCache(trigger));
      await TestBed.inject(ApplicationRef).whenStable();

      expect(cache().get('snap-A')).toEqual([makePosition({ ticker: 'snap-A-pos' })]);
    });

    it('accumulates entries across distinct trigger values', async () => {
      repo.positionsSource = (id) => of([makePosition({ ticker: `${id}-pos` })]);
      const trigger = signal<string | undefined>('snap-A');

      const cache = TestBed.runInInjectionContext(() => repo.positionsCache(trigger));
      await TestBed.inject(ApplicationRef).whenStable();
      trigger.set('snap-B');
      await TestBed.inject(ApplicationRef).whenStable();

      // Map carries BOTH entries — the second emit didn't replace the first.
      expect(cache().size).toBe(2);
      expect(cache().has('snap-A')).toBe(true);
      expect(cache().has('snap-B')).toBe(true);
    });

    it('does not re-fetch when the trigger emits the same value twice in a row', async () => {
      const calls: string[] = [];
      repo.positionsSource = (id) => {
        calls.push(id);
        return of([makePosition()]);
      };
      const trigger = signal<string | undefined>('snap-A');

      TestBed.runInInjectionContext(() => repo.positionsCache(trigger));
      await TestBed.inject(ApplicationRef).whenStable();
      trigger.set('snap-A'); // same value
      await TestBed.inject(ApplicationRef).whenStable();

      // Only one fetch — rxResource's params equality short-circuits the second emit.
      expect(calls).toEqual(['snap-A']);
    });

    it('throws synchronously when called outside an injection context', () => {
      const trigger = signal<string | undefined>(undefined) as Signal<string | undefined>;
      expect(() => repo.positionsCache(trigger)).toThrow();
    });
  });
});
