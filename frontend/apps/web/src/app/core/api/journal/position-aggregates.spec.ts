import { describe, expect, it } from 'vitest';
import { computePositionAggregates } from './position-aggregates';
import { TradeExecutionInput } from './trade-entry.model';

/**
 * Pins the frontend mirror of the backend `TradePositionCalculator`. The preview must agree with the
 * backend's sign convention so the live numbers the user sees before saving match what comes back :
 *  - SHORT profits when covered below the entry, LONG when sold above it ;
 *  - aggregates derive from weighted averages across multiple legs ;
 *  - an open or inconsistent position degrades gracefully (no throw, `valid` flag flips).
 */
describe('computePositionAggregates', () => {
  const entry = (shares: number, price: number): TradeExecutionInput => ({
    kind: 'ENTRY',
    shares,
    price,
  });
  const exit = (shares: number, price: number): TradeExecutionInput => ({
    kind: 'EXIT',
    shares,
    price,
  });

  it('returns an empty open position when there are no executions', () => {
    const agg = computePositionAggregates('SHORT', []);
    expect(agg).toEqual({
      size: null,
      avgEntry: null,
      avgExit: null,
      profitDollars: null,
      gainPercent: null,
      status: 'OPEN',
      valid: true,
    });
  });

  it('computes a single-leg SHORT round-trip (sold high, covered low → profit)', () => {
    const agg = computePositionAggregates('SHORT', [entry(100, 5), exit(100, 4)]);
    expect(agg.size).toBe(100);
    expect(agg.avgEntry).toBe(5);
    expect(agg.avgExit).toBe(4);
    expect(agg.profitDollars).toBe(100); // (5 - 4) * 100
    expect(agg.gainPercent).toBeCloseTo(20); // 100 / (5 * 100) * 100
    expect(agg.status).toBe('CLOSED');
  });

  it('flips the sign for a LONG position (bought low, sold high → profit)', () => {
    const agg = computePositionAggregates('BUY', [entry(100, 4), exit(100, 5)]);
    expect(agg.profitDollars).toBe(100); // (5 - 4) * 100
    expect(agg.status).toBe('CLOSED');
  });

  it('weights the average entry across scale-in legs', () => {
    // 100 @ 6 + 100 @ 4 → avg 5 ; covering all 200 @ 4.5 (short) → (5 - 4.5) * 200 = 100.
    const agg = computePositionAggregates('SHORT', [entry(100, 6), entry(100, 4), exit(200, 4.5)]);
    expect(agg.avgEntry).toBe(5);
    expect(agg.size).toBe(200);
    expect(agg.profitDollars).toBe(100);
    expect(agg.status).toBe('CLOSED');
  });

  it('marks a partially-closed position PARTIAL with realized P&L on the exited shares', () => {
    const agg = computePositionAggregates('SHORT', [entry(200, 5), exit(100, 4)]);
    expect(agg.size).toBe(200);
    expect(agg.profitDollars).toBe(100); // (5 - 4) * 100 exited
    expect(agg.status).toBe('PARTIAL');
  });

  it('leaves P&L null while the position is fully open', () => {
    const agg = computePositionAggregates('SHORT', [entry(100, 5)]);
    expect(agg.avgEntry).toBe(5);
    expect(agg.avgExit).toBeNull();
    expect(agg.profitDollars).toBeNull();
    expect(agg.status).toBe('OPEN');
  });

  it('flags an inconsistent position when exited shares exceed entered', () => {
    const agg = computePositionAggregates('SHORT', [entry(100, 5), exit(150, 4)]);
    expect(agg.valid).toBe(false);
  });

  it('flags missing direction when executions are present', () => {
    const agg = computePositionAggregates(null, [entry(100, 5)]);
    expect(agg.valid).toBe(false);
  });
});
