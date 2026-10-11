import { describe, expect, it } from 'vitest';
import { CashFlowBucket } from '../../core/api/account/account.model';
import {
  REPORT_TYPES,
  TRADING_ONLY,
  breakdown,
  bucketSizeAllowed,
  defaultBucketSize,
  fittingBucketSize,
  nothingMoved,
  seriesKeys,
  seriesValues,
  totals,
} from './cash-flow';

/**
 * The rules of the « Flux du compte » report (#685, #696), pure so they read as the spec
 * (`PARCOURS.md`, « Reports ») :
 *
 *  - **The bar size** opens from the period (a month by days, three months by weeks, a year by
 *    months) and is disabled **both ways** — wider than the period, or more than 400 bars.
 *  - **The series** follow the chips : trades split into winners and losers, locates and
 *    corrections one « fees » series.
 *  - **The breakdown** gives each type its share of the period's gross flows.
 *  - **An empty period** is told apart from a period whose net is zero.
 */
function bucket(overrides: Partial<CashFlowBucket> = {}): CashFlowBucket {
  return {
    from: new Date(2026, 8, 14),
    to: new Date(2026, 8, 20),
    winningTrades: 0,
    losingTrades: 0,
    locates: 0,
    deposits: 0,
    withdrawals: 0,
    adjustments: 0,
    net: 0,
    ...overrides,
  };
}

const SEPT = { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) };
const QUARTER = { from: new Date(2026, 6, 1), to: new Date(2026, 8, 30) };
const TWO_YEARS = { from: new Date(2025, 0, 1), to: new Date(2026, 11, 31) };

describe('the bar size', () => {
  it('opens a month by days, three months by weeks, a year and all time by months', () => {
    expect(defaultBucketSize('thisMonth', SEPT.from, SEPT.to)).toBe('DAY');
    expect(defaultBucketSize('last3Months', QUARTER.from, QUARTER.to)).toBe('WEEK');
    expect(defaultBucketSize('thisYear', null, null)).toBe('MONTH');
    expect(defaultBucketSize('all', null, null)).toBe('MONTH');
  });

  it('opens a custom range by its length', () => {
    expect(defaultBucketSize('custom', SEPT.from, SEPT.to)).toBe('DAY');
    expect(defaultBucketSize('custom', QUARTER.from, QUARTER.to)).toBe('WEEK');
    expect(defaultBucketSize('custom', TWO_YEARS.from, TWO_YEARS.to)).toBe('MONTH');
  });

  it('disables a size wider than the period — a single bar says nothing', () => {
    expect(bucketSizeAllowed('MONTH', SEPT.from, SEPT.to)).toBe(true);
    expect(bucketSizeAllowed('QUARTER', SEPT.from, SEPT.to)).toBe(false);
    expect(bucketSizeAllowed('YEAR', QUARTER.from, QUARTER.to)).toBe(false);
  });

  // The endpoint refuses more than 400 bars (#694) : a greyed-out choice beats its error.
  it('disables a size that would draw more than 400 bars', () => {
    expect(bucketSizeAllowed('DAY', TWO_YEARS.from, TWO_YEARS.to)).toBe(false);
    expect(bucketSizeAllowed('WEEK', TWO_YEARS.from, TWO_YEARS.to)).toBe(true);
  });

  it('allows any size while the span is unknown', () => {
    expect(bucketSizeAllowed('DAY', null, null)).toBe(true);
  });

  it('moves a default that does not fit to the next size that does', () => {
    const tenDays = { from: new Date(2026, 8, 1), to: new Date(2026, 8, 10) };

    expect(fittingBucketSize('MONTH', tenDays.from, tenDays.to)).toBe('WEEK');
    expect(fittingBucketSize('DAY', TWO_YEARS.from, TWO_YEARS.to)).toBe('WEEK');
  });
});

describe('the series', () => {
  it('splits the trades and folds locates and corrections into one fees series', () => {
    expect(seriesKeys(REPORT_TYPES)).toEqual([
      'winning',
      'losing',
      'fees',
      'deposits',
      'withdrawals',
    ]);
    expect(seriesKeys(TRADING_ONLY)).toEqual(['winning', 'losing', 'fees']);
    expect(seriesKeys(['DEPOSIT'])).toEqual(['deposits']);
  });

  it('adds the corrections to the locates in the fees', () => {
    expect(seriesValues(bucket({ locates: -262, adjustments: -12.4 })).fees).toBeCloseTo(-274.4);
  });
});

describe('the breakdown', () => {
  const t = totals([
    bucket({ winningTrades: 312, losingTrades: -405, locates: -262, withdrawals: -500 }),
    bucket({ winningTrades: 610.35, locates: -340.4, deposits: 1000, adjustments: -12.4 }),
  ]);

  it('sums the period per field', () => {
    expect(t.winningTrades).toBeCloseTo(922.35);
    expect(t.locates).toBeCloseTo(-602.4);
    expect(t.deposits).toBe(1000);
  });

  it('shares each type of the gross flows, trades split into winners and losers', () => {
    const rows = breakdown(t, REPORT_TYPES);
    const gross = 922.35 + 405 + 602.4 + 12.4 + 1000 + 500;

    expect(rows.map((r) => r.key)).toEqual([
      'trades',
      'winning',
      'losing',
      'locates',
      'adjustments',
      'deposits',
      'withdrawals',
    ]);
    expect(rows.find((r) => r.key === 'deposits')?.share).toBeCloseTo((1000 / gross) * 100);
    expect(rows.find((r) => r.key === 'trades')?.share).toBeCloseTo(((922.35 + 405) / gross) * 100);
    expect(rows.filter((r) => r.indent).map((r) => r.key)).toEqual(['winning', 'losing']);
  });

  it('keeps only the types the chips let through, sharing among them', () => {
    const rows = breakdown(t, TRADING_ONLY);

    expect(rows.map((r) => r.key)).toEqual(['trades', 'winning', 'losing', 'locates']);
    expect(rows.find((r) => r.key === 'locates')?.share).toBeCloseTo(
      (602.4 / (922.35 + 405 + 602.4)) * 100,
    );
  });
});

describe('an empty period', () => {
  it('is one where nothing moved, not one whose net is zero', () => {
    expect(nothingMoved([bucket(), bucket()])).toBe(true);
    expect(nothingMoved([bucket({ winningTrades: 50, losingTrades: -50 })])).toBe(false);
  });
});
