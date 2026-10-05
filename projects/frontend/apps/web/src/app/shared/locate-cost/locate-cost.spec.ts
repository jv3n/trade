import { describe, expect, it } from 'vitest';
import {
  blendedLocatePercent,
  locateBreach,
  locateCost,
  locatePercent,
  sumCents,
} from './locate-cost';

/**
 * The locate cost previewed while typing must be the one the backend saves, to the cent — and the
 * day totals must not drift the way a float running sum does. The locate's weight against the share
 * is a plain percentage.
 */
describe('locateCost', () => {
  it('is the shares located times the price per share, to the cent', () => {
    // SGBX : 2 000 shares at 0.12 — the float product is 240.00000000000003.
    expect(locateCost(2000, 0.12)).toBe(240);
    expect(locateCost(1000, 0.0333)).toBe(33.3);
  });

  // The float product sits just under these half-cents : the backend's HALF_UP rounds them up.
  it('rounds an exact half-cent up, like the backend', () => {
    expect(locateCost(150, 0.0069)).toBe(1.04);
    expect(locateCost(150, 0.0081)).toBe(1.22);
    expect(locateCost(150, 0.0113)).toBe(1.7);
  });

  it('is zero for a locate charged nothing', () => {
    expect(locateCost(1000, 0)).toBe(0);
  });

  it('returns null until shares above zero and a price are typed', () => {
    expect(locateCost(null, 0.12)).toBeNull();
    expect(locateCost(0, 0.12)).toBeNull();
    expect(locateCost(2000, null)).toBeNull();
  });
});

describe('locatePercent', () => {
  it('weighs the price per share against the share price', () => {
    expect(locatePercent(0.05, 2.5)).toBeCloseTo(2, 6);
    expect(locatePercent(0.12, 1.85)).toBeCloseTo(6.49, 2);
  });

  it('returns null without a price or a positive share price', () => {
    expect(locatePercent(null, 2.5)).toBeNull();
    expect(locatePercent(0.05, null)).toBeNull();
    expect(locatePercent(0.05, 0)).toBeNull();
  });
});

describe('locateBreach', () => {
  it('flags a weight at or above 2 %, never an unknown one', () => {
    expect(locateBreach(1.99)).toBe(false);
    expect(locateBreach(2)).toBe(true);
    expect(locateBreach(null)).toBe(false);
  });
});

describe('blendedLocatePercent', () => {
  // Two top-ups : 2 000 at 0.04 on a $2.50 share (1.6 %), 500 at 0.06 on $2.40 (2.5 %).
  it("weighs the day's locates together, not row by row", () => {
    const blended = blendedLocatePercent([
      { shares: 2000, pricePerShare: 0.04, stockPrice: 2.5 },
      { shares: 500, pricePerShare: 0.06, stockPrice: 2.4 },
    ]);
    // 110 paid on 6 200 of shares.
    expect(blended).toBeCloseTo(1.774, 3);
  });

  it('leaves out a locate typed without a share price, and is null with none', () => {
    expect(
      blendedLocatePercent([
        { shares: 1000, pricePerShare: 0.05, stockPrice: 2.5 },
        { shares: 1000, pricePerShare: 0.5, stockPrice: null },
      ]),
    ).toBeCloseTo(2, 6);
    expect(
      blendedLocatePercent([{ shares: 1000, pricePerShare: 0.05, stockPrice: null }]),
    ).toBeNull();
  });
});

describe('sumCents', () => {
  it('adds amounts to the cent without float drift', () => {
    expect(sumCents([0.1, 0.2])).toBe(0.3);
    expect(sumCents([240, 150, 30])).toBe(420);
    expect(sumCents([])).toBe(0);
  });
});
