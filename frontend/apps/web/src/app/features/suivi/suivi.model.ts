import { SnapshotSummary } from '../../core/api/portfolio/snapshot.repository';

export interface Batch {
  batchId: string;
  importedAt: string;
  snapshots: SnapshotSummary[];
  totalBookValueCad: number;
  expanded: boolean;
}
