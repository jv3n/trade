import { map, Observable } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { Signal, effect, signal } from '@angular/core';

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

  allResource() {
    return rxResource({ stream: () => this.getAll() });
  }

  /**
   * Per-id cache : returns a `Signal<Map<id, positions>>` that grows as the trigger fires. The
   * accumulator effect lives on the port so the consumer just reads the map.
   */
  positionsCache(trigger: Signal<string | undefined>) {
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
