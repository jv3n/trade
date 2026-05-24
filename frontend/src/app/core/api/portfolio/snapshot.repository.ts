import { map, Observable } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { Signal, assertInInjectionContext, effect, signal } from '@angular/core';

export interface SnapshotSummary {
  id: string;
  batchId: string;
  portfolioId: string;
  portfolioName: string;
  importedAt: string;
  positionCount: number;
  totalBookValueCad: number;
}

export interface SnapshotPosition {
  ticker: string;
  name: string;
  assetType: string;
  quantity: number;
  bookValueCad: number;
  marketValue: number;
  marketCurrency: string;
  unrealizedGain: number | null;
  gainCurrency: string | null;
}

/**
 * Snapshot port. Resource builders live on the port — see the `angular-signals` skill section
 * « Resource builders live on the port itself ». Test mocks must extend the class via `useClass`
 * so the inherited builders stay wired.
 */
export abstract class SnapshotRepository {
  abstract getAll(): Observable<SnapshotSummary[]>;
  abstract getPositions(snapshotId: string): Observable<SnapshotPosition[]>;

  /**
   * Returns an `rxResource` bound to the full snapshot list. **Must be called from an injection
   * context** (field initialiser of a component / directive / service, or wrapped in
   * `runInInjectionContext`) — `rxResource` ties its cleanup to the caller's `DestroyRef`. The
   * `assertInInjectionContext` guard fails loudly at runtime when this contract is broken,
   * rather than leaving an orphaned subscription dangling.
   */
  allResource() {
    assertInInjectionContext(this.allResource);
    return rxResource({ stream: () => this.getAll() });
  }

  /**
   * Per-id cache : returns a `Signal<Map<id, positions>>` that grows as the trigger fires. The
   * accumulator `effect()` lives on the port so the consumer just reads the map. The effect
   * captures the **caller's** `DestroyRef` ; calling this builder outside an injection context
   * would leak the effect for the lifetime of the JS heap. The
   * `assertInInjectionContext` guard fails loudly when that happens instead of leaking silently.
   */
  positionsCache(trigger: Signal<string | undefined>) {
    assertInInjectionContext(this.positionsCache);
    const cache = signal(new Map<string, SnapshotPosition[]>());
    const resource = rxResource({
      params: () => trigger(),
      stream: ({ params }) =>
        this.getPositions(params).pipe(map((positions) => ({ id: params, positions }))),
    });
    effect(() => {
      const emit = resource.value();
      if (!emit) return;
      cache.update((m) => new Map(m).set(emit.id, emit.positions));
    });
    return cache.asReadonly();
  }
}
