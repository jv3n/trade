import { describe, expect, it } from 'vitest';
import { gapPercent, locatePercent, pushPercent, targetPrice } from './candidates.math';

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
