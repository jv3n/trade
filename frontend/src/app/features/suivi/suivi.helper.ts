import { SnapshotSummary } from '../../core/api/portfolio/snapshot.repository';
import { Batch } from './suivi.model';

/**
 * Bucketise snapshots by `batchId`. First-appearance order wins (matches the backend's
 * `findAllByOrderByImportedAtDesc`), `totalBookValueCad` sums every snapshot in the batch, and
 * `expanded` is derived from the `collapsed` set so the page can drive UI state through a
 * separate signal without mutating the grouping output.
 */
export function groupIntoBatches(summaries: SnapshotSummary[], collapsed: Set<string>): Batch[] {
  const batchMap = new Map<string, Batch>();
  for (const s of summaries) {
    let batch = batchMap.get(s.batchId);
    if (!batch) {
      batch = {
        batchId: s.batchId,
        importedAt: s.importedAt,
        snapshots: [],
        totalBookValueCad: 0,
        expanded: !collapsed.has(s.batchId),
      };
      batchMap.set(s.batchId, batch);
    }
    batch.snapshots.push(s);
    batch.totalBookValueCad += s.totalBookValueCad;
  }
  return Array.from(batchMap.values());
}
