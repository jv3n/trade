import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StbIconModule, StbProgressSpinnerModule } from '@portfolioai/ui';
import { SnapshotPosition, SnapshotRepository } from '../../core/api/portfolio/snapshot.repository';
import { toggleSet } from '../../shared/toggle-set/toggle-set';
import { groupIntoBatches } from './suivi.helper';
import { Batch } from './suivi.model';

@Component({
  selector: 'app-suivi',
  imports: [StbIconModule, StbProgressSpinnerModule, DatePipe, DecimalPipe, TranslatePipe],
  templateUrl: './suivi.html',
  styleUrl: './suivi.scss',
})
export class Suivi {
  private readonly repository = inject(SnapshotRepository);
  private readonly translate = inject(TranslateService);

  private readonly snapshots = this.repository.allResource();
  private readonly batchCollapsed = signal<Set<string>>(new Set());
  private readonly expandFor = signal<string | undefined>(undefined);
  private readonly positions = this.repository.positionsCache(this.expandFor);

  readonly expandedSnapshots = signal<Set<string>>(new Set());

  readonly loading = this.snapshots.isLoading;
  readonly error = computed(() =>
    this.snapshots.error() ? this.translate.instant('suivi.loadError') : null,
  );
  readonly batches = computed<Batch[]>(() =>
    groupIntoBatches(this.snapshots.value() ?? [], this.batchCollapsed()),
  );

  reload(): void {
    this.snapshots.reload();
  }

  toggleBatch(batchId: string): void {
    this.batchCollapsed.update((s) => toggleSet(s, batchId));
  }

  toggleSnapshot(id: string): void {
    this.expandedSnapshots.update((s) => toggleSet(s, id));
    if (this.expandedSnapshots().has(id) && !this.positions().has(id)) {
      this.expandFor.set(id);
    }
  }

  isSnapshotExpanded(id: string): boolean {
    return this.expandedSnapshots().has(id);
  }

  getPositions(id: string): SnapshotPosition[] {
    return this.positions().get(id) ?? [];
  }

  gainClass(gain: number | null): string {
    if (gain === null) return '';
    return gain >= 0 ? 'positive' : 'negative';
  }
}
