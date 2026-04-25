import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SnapshotService, SnapshotSummary, SnapshotPosition } from '../core/snapshot.service';

interface Batch {
  batchId: string;
  importedAt: string;
  snapshots: SnapshotSummary[];
  totalBookValueCad: number;
  expanded: boolean;
}

@Component({
  selector: 'app-suivi',
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './suivi.html',
  styleUrl: './suivi.scss',
})
export class Suivi implements OnInit {
  private readonly snapshotService = inject(SnapshotService);

  loading = signal(false);
  error = signal<string | null>(null);

  batches = signal<Batch[]>([]);
  expandedSnapshots = signal<Set<string>>(new Set());
  positions = signal<Map<string, SnapshotPosition[]>>(new Map());

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.snapshotService.getAll().subscribe({
      next: summaries => {
        const batchMap = new Map<string, Batch>();
        for (const s of summaries) {
          let batch = batchMap.get(s.batchId);
          if (!batch) {
            batch = { batchId: s.batchId, importedAt: s.importedAt, snapshots: [], totalBookValueCad: 0, expanded: true };
            batchMap.set(s.batchId, batch);
          }
          batch.snapshots.push(s);
          batch.totalBookValueCad += s.totalBookValueCad;
        }
        this.batches.set(Array.from(batchMap.values()));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger le suivi.');
        this.loading.set(false);
      },
    });
  }

  toggleBatch(batch: Batch) {
    batch.expanded = !batch.expanded;
    this.batches.update(b => [...b]);
  }

  toggleSnapshot(snapshotId: string) {
    this.expandedSnapshots.update(set => {
      const next = new Set(set);
      if (next.has(snapshotId)) { next.delete(snapshotId); return next; }
      next.add(snapshotId);
      if (!this.positions().has(snapshotId)) this.loadPositions(snapshotId);
      return next;
    });
  }

  isSnapshotExpanded(id: string): boolean {
    return this.expandedSnapshots().has(id);
  }

  getPositions(id: string): SnapshotPosition[] {
    return this.positions().get(id) ?? [];
  }

  private loadPositions(snapshotId: string) {
    this.snapshotService.getPositions(snapshotId).subscribe({
      next: pos => this.positions.update(m => new Map(m).set(snapshotId, pos)),
    });
  }

  gainClass(gain: number | null): string {
    if (gain === null) return '';
    return gain >= 0 ? 'positive' : 'negative';
  }
}
