import { describe, expect, it } from 'vitest';
import { computePeriodRange } from './period-preset';

/**
 * Pure-function tests on the period preset helper — each preset must resolve to the right
 * `(dateFrom, dateTo)` pair relative to a fixed "now". A regression here would silently shift
 * the filter range and the journal page would show the wrong slice of trades.
 *
 * `now` is anchored at 2026-06-15 (mid-month, mid-quarter Q2, mid-year) so every preset
 * exercises a non-trivial computation : `thisMonth` doesn't land on a month boundary,
 * `thisQuarter` is Q2 (not the default Q1), etc.
 */
describe('computePeriodRange', () => {
  const NOW = new Date(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 local

  it('all → null/null (no filter)', () => {
    const r = computePeriodRange('all', NOW);
    expect(r.dateFrom).toBeNull();
    expect(r.dateTo).toBeNull();
  });

  it('custom → null/null (the form drives the dates)', () => {
    const r = computePeriodRange('custom', NOW);
    expect(r.dateFrom).toBeNull();
    expect(r.dateTo).toBeNull();
  });

  it('thisMonth → 2026-06-01 → 2026-06-30 23:59:59.999', () => {
    const r = computePeriodRange('thisMonth', NOW);
    expect(r.dateFrom).toEqual(new Date(2026, 5, 1, 0, 0, 0));
    expect(r.dateTo?.getMonth()).toBe(5);
    expect(r.dateTo?.getDate()).toBe(30);
  });

  it('lastMonth → 2026-05-01 → 2026-05-31', () => {
    const r = computePeriodRange('lastMonth', NOW);
    expect(r.dateFrom?.getMonth()).toBe(4);
    expect(r.dateFrom?.getDate()).toBe(1);
    expect(r.dateTo?.getMonth()).toBe(4);
    expect(r.dateTo?.getDate()).toBe(31);
  });

  it('thisQuarter (June → Q2) → 2026-04-01 → 2026-06-30', () => {
    const r = computePeriodRange('thisQuarter', NOW);
    expect(r.dateFrom?.getMonth()).toBe(3); // April
    expect(r.dateFrom?.getDate()).toBe(1);
    expect(r.dateTo?.getMonth()).toBe(5); // June
    expect(r.dateTo?.getDate()).toBe(30);
  });

  it('lastQuarter (June - 1Q → Q1) → 2026-01-01 → 2026-03-31', () => {
    const r = computePeriodRange('lastQuarter', NOW);
    expect(r.dateFrom?.getMonth()).toBe(0);
    expect(r.dateFrom?.getDate()).toBe(1);
    expect(r.dateTo?.getMonth()).toBe(2);
    expect(r.dateTo?.getDate()).toBe(31);
  });

  it('thisYear → 2026-01-01 → 2026-12-31', () => {
    const r = computePeriodRange('thisYear', NOW);
    expect(r.dateFrom?.getFullYear()).toBe(2026);
    expect(r.dateFrom?.getMonth()).toBe(0);
    expect(r.dateFrom?.getDate()).toBe(1);
    expect(r.dateTo?.getFullYear()).toBe(2026);
    expect(r.dateTo?.getMonth()).toBe(11);
    expect(r.dateTo?.getDate()).toBe(31);
  });

  it('lastYear → 2025-01-01 → 2025-12-31', () => {
    const r = computePeriodRange('lastYear', NOW);
    expect(r.dateFrom?.getFullYear()).toBe(2025);
    expect(r.dateFrom?.getMonth()).toBe(0);
    expect(r.dateTo?.getFullYear()).toBe(2025);
    expect(r.dateTo?.getMonth()).toBe(11);
    expect(r.dateTo?.getDate()).toBe(31);
  });

  it('Q1 quarter boundary — Jan 1 still lands inside Q1', () => {
    const newYear = new Date(2026, 0, 1, 12, 0, 0);
    const r = computePeriodRange('thisQuarter', newYear);
    expect(r.dateFrom?.getMonth()).toBe(0);
    expect(r.dateTo?.getMonth()).toBe(2);
  });

  it('lastQuarter from Q1 wraps to the previous year Q4', () => {
    const earlyJan = new Date(2026, 0, 5, 12, 0, 0);
    const r = computePeriodRange('lastQuarter', earlyJan);
    expect(r.dateFrom?.getFullYear()).toBe(2025);
    expect(r.dateFrom?.getMonth()).toBe(9); // October
    expect(r.dateTo?.getFullYear()).toBe(2025);
    expect(r.dateTo?.getMonth()).toBe(11); // December
    expect(r.dateTo?.getDate()).toBe(31);
  });
});
