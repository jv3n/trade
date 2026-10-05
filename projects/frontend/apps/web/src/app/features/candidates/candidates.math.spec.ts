import { describe, expect, it } from 'vitest';
import {
  gapPercent,
  locateCost,
  locatePercent,
  pushPercent,
  sumCents,
  targetPrice,
} from './candidates.math';

/**
 * Pure-function spec for the candidates' derived figures. Pins the formulas of
 * `mockup/PARCOURS.md › Étape 1` on its KTTA example (previous close 2.65, PM open 4.05, PM high
 * 4.65, locate 0.03, open 4.20) and the **null-on-bad-input** contract : a missing field or a
 * non-positive base yields `null`, never `NaN` / `Infinity`.
 */
describe('gapPercent', () => {
  it('measures the PM open against the previous close', () => {
    expect(gapPercent(2.65, 4.05)).toBeCloseTo(52.83, 2);
  });

  it('is negative for a gap down', () => {
    expect(gapPercent(4, 3)).toBeCloseTo(-25, 5);
  });

  it('returns null while a price is missing or the previous close is not positive', () => {
    expect(gapPercent(null, 4.05)).toBeNull();
    expect(gapPercent(2.65, null)).toBeNull();
    expect(gapPercent(0, 4.05)).toBeNull();
  });
});

describe('pushPercent', () => {
  it('measures the PM high against the PM open', () => {
    expect(pushPercent(4.05, 4.65)).toBeCloseTo(14.81, 2);
  });

  it('is zero when the PM high is the PM open', () => {
    expect(pushPercent(4.05, 4.05)).toBe(0);
  });

  it('returns null while a price is missing or the PM open is not positive', () => {
    expect(pushPercent(null, 4.65)).toBeNull();
    expect(pushPercent(4.05, null)).toBeNull();
    expect(pushPercent(0, 4.65)).toBeNull();
  });
});

describe('locatePercent', () => {
  it('weighs the locate against the PM open', () => {
    expect(locatePercent(0.03, 4.05)).toBeCloseTo(0.74, 2);
  });

  it('returns null without a locate or a positive PM open', () => {
    expect(locatePercent(null, 4.05)).toBeNull();
    expect(locatePercent(0.03, null)).toBeNull();
    expect(locatePercent(0.03, 0)).toBeNull();
  });
});

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

describe('sumCents', () => {
  it('adds amounts to the cent without float drift', () => {
    expect(sumCents([0.1, 0.2])).toBe(0.3);
    expect(sumCents([240, 150, 30])).toBe(420);
    expect(sumCents([])).toBe(0);
  });
});

describe('targetPrice', () => {
  it('adds the average push at the open to the open', () => {
    // KTTA opens at 4.20 ; the completed GUS stats push +9.6 % on average after the open.
    expect(targetPrice(4.2, 9.6)).toBeCloseTo(4.6032, 4);
  });

  it('is the open itself when the average push is zero', () => {
    expect(targetPrice(4.2, 0)).toBe(4.2);
  });

  it('returns null without an open, a positive open or an average push', () => {
    // No average push = no completed stat for the pattern yet : nothing to aim at.
    expect(targetPrice(4.2, null)).toBeNull();
    expect(targetPrice(null, 9.6)).toBeNull();
    expect(targetPrice(0, 9.6)).toBeNull();
  });
});
