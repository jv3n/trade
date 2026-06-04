/**
 * Tests on [groupIntoBatches] — the pure grouping helper extracted from the Suivi page so we can
 * pin its behaviour without booting a component. Bucketise snapshots by `batchId`, sum
 * `totalBookValueCad`, and derive `expanded` from a `collapsed` set so the page can drive UI state
 * through a separate signal without mutating the grouping output.
 *
 * What we pin :
 * - **First-appearance order** wins (mirrors the backend's `findAllByOrderByImportedAtDesc`).
 * - **`totalBookValueCad`** sums every snapshot in the batch.
 * - **`expanded` defaults to `true`** when the batch id is absent from the collapsed set ; flips
 *   to `false` when present.
 * - **Empty input** returns an empty list (vacuous, but the page relies on this for the empty-state).
 */
import { groupIntoBatches } from './suivi.helper';
import { SnapshotSummary } from '../../core/api/portfolio/snapshot.repository';

const makeSummary = (overrides: Partial<SnapshotSummary> = {}): SnapshotSummary => ({
  id: 'snap-1',
  batchId: 'batch-1',
  portfolioId: 'p-1',
  portfolioName: 'CELI',
  importedAt: '2025-01-01T00:00:00Z',
  positionCount: 3,
  totalBookValueCad: 1000,
  ...overrides,
});

describe('groupIntoBatches', () => {
  it('returns an empty list when given no summaries', () => {
    expect(groupIntoBatches([], new Set())).toEqual([]);
  });

  it('groups summaries that share a batchId into a single bucket', () => {
    const result = groupIntoBatches(
      [
        makeSummary({ id: 's1', batchId: 'B', portfolioName: 'CELI', totalBookValueCad: 3000 }),
        makeSummary({ id: 's2', batchId: 'B', portfolioName: 'REER', totalBookValueCad: 2000 }),
      ],
      new Set(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe('B');
    expect(result[0].snapshots.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('sums totalBookValueCad across the snapshots of a batch', () => {
    const result = groupIntoBatches(
      [
        makeSummary({ id: 's1', batchId: 'B', totalBookValueCad: 3000 }),
        makeSummary({ id: 's2', batchId: 'B', totalBookValueCad: 2000 }),
        makeSummary({ id: 's3', batchId: 'B', totalBookValueCad: 1500 }),
      ],
      new Set(),
    );
    expect(result[0].totalBookValueCad).toBe(6500);
  });

  it('keeps batches in their first-appearance order', () => {
    // The backend already returns snapshots sorted by `importedAt DESC` — the helper must not
    // re-sort, otherwise the UI would scramble the chronology mid-render.
    const result = groupIntoBatches(
      [
        makeSummary({ id: 's1', batchId: 'B-late' }),
        makeSummary({ id: 's2', batchId: 'A-early' }),
        makeSummary({ id: 's3', batchId: 'B-late' }),
      ],
      new Set(),
    );
    expect(result.map((b) => b.batchId)).toEqual(['B-late', 'A-early']);
  });

  it('defaults expanded=true when the batchId is absent from the collapsed set', () => {
    const result = groupIntoBatches([makeSummary({ batchId: 'B' })], new Set());
    expect(result[0].expanded).toBe(true);
  });

  it('flips expanded=false when the batchId is in the collapsed set', () => {
    const result = groupIntoBatches([makeSummary({ batchId: 'B' })], new Set(['B']));
    expect(result[0].expanded).toBe(false);
  });

  it('carries importedAt from the first snapshot of each batch', () => {
    // The header of a batch row shows the import timestamp ; we pick the first one we see and
    // rely on the backend chronology being already sorted.
    const result = groupIntoBatches(
      [
        makeSummary({ id: 's1', batchId: 'B', importedAt: '2025-03-01T12:00:00Z' }),
        makeSummary({ id: 's2', batchId: 'B', importedAt: '2025-03-01T12:00:05Z' }),
      ],
      new Set(),
    );
    expect(result[0].importedAt).toBe('2025-03-01T12:00:00Z');
  });
});
