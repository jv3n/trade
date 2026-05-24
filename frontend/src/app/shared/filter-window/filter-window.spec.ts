/**
 * Tests on [buildFilterWindow] — the pure helper that shapes the observability + bias page filter
 * signals into the wire payload. Pin the invariants that justify extracting it from its two
 * duplicate call sites :
 *
 * - **Half-open interval** : `to` becomes the next-day UTC midnight so the user-picked `to` day is
 *   included.
 * - **Empty triple collapses to undefined** so the adapter omits the query string entirely (« no
 *   filter ») rather than firing `?from=&to=&promptId=` with empty values.
 * - **Single non-empty axis is enough** to produce a partial filter (the other axes stay
 *   undefined ; the adapter strips them).
 * - **`promptId = ''` collapses** like an unset field — pages set the signal to the literal empty
 *   string when the user clears the dropdown, and that's not a legitimate filter value.
 */
import { describe, expect, it } from 'vitest';

import { buildFilterWindow } from './filter-window';

describe('buildFilterWindow', () => {
  it('returns undefined when every input is empty', () => {
    expect(buildFilterWindow('', '', '')).toBeUndefined();
  });

  it('expands a from date to UTC midnight of the same day', () => {
    const result = buildFilterWindow('2026-04-03', '', '');
    expect(result).toEqual({ from: '2026-04-03T00:00:00Z', to: undefined, promptId: undefined });
  });

  it('expands a to date to UTC midnight of the NEXT day so the picked day is included', () => {
    const result = buildFilterWindow('', '2026-04-10', '');
    expect(result).toEqual({ from: undefined, to: '2026-04-11T00:00:00Z', promptId: undefined });
  });

  it('rolls month boundaries on the to-date next-day expansion', () => {
    // 2026-04-30 → 2026-05-01 is the cross-month case Date math gets wrong if you treat it as
    // string arithmetic. The UTC-based helper handles it via the Date API.
    const result = buildFilterWindow('', '2026-04-30', '');
    expect(result?.to).toBe('2026-05-01T00:00:00Z');
  });

  it('rolls year boundaries on the to-date next-day expansion', () => {
    const result = buildFilterWindow('', '2026-12-31', '');
    expect(result?.to).toBe('2027-01-01T00:00:00Z');
  });

  it('passes the promptId through when non-empty', () => {
    const result = buildFilterWindow('', '', 'abc-123');
    expect(result).toEqual({ from: undefined, to: undefined, promptId: 'abc-123' });
  });

  it('collapses an empty promptId string to undefined', () => {
    // The page sets `promptId.set('')` when the user clears the dropdown ; that's not a real
    // filter value. The helper must drop it rather than forwarding `?promptId=` empty.
    const result = buildFilterWindow('2026-04-03', '', '');
    expect(result?.promptId).toBeUndefined();
  });

  it('combines all three axes when set together', () => {
    const result = buildFilterWindow('2026-04-03', '2026-04-10', 'abc-123');
    expect(result).toEqual({
      from: '2026-04-03T00:00:00Z',
      to: '2026-04-11T00:00:00Z',
      promptId: 'abc-123',
    });
  });
});
