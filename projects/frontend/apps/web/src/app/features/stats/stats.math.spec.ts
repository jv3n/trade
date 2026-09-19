import { describe, expect, it } from 'vitest';
import { gapPercent, percentVsOpen, pmPushPercent } from './stats.math';

/**
 * Pure-function spec for the stats' derived figures. Pins the formulas of `mockup/PARCOURS.md`
 * (steps 1 and 5) on its KTTA example — previous close 2.65, PM open 4.05, PM high 4.65, session
 * open 4.20, push at open 4.62, LOD 3.41, EOD 3.52 — and the **null-on-bad-input** contract : a
 * missing price or a non-positive base yields `null`, never `NaN` / `Infinity`.
 */
describe('gapPercent', () => {
  it('measures the PM open against the previous close', () => {
    expect(gapPercent(2.65, 4.05)).toBeCloseTo(52.83, 2);
  });

  it('returns null without a previous close', () => {
    expect(gapPercent(null, 4.05)).toBeNull();
  });
});

describe('pmPushPercent', () => {
  it('measures the PM high against the PM open', () => {
    expect(pmPushPercent(4.05, 4.65)).toBeCloseTo(14.81, 2);
  });

  it('returns null when the PM open is not positive', () => {
    expect(pmPushPercent(0, 4.65)).toBeNull();
  });
});

describe('percentVsOpen', () => {
  it('is positive above the open — the push that follows the open', () => {
    expect(percentVsOpen(4.2, 4.62)).toBeCloseTo(10, 5);
  });

  it('is negative below the open — the LOD and a faded close', () => {
    expect(percentVsOpen(4.2, 3.41)).toBeCloseTo(-18.81, 2);
    expect(percentVsOpen(4.2, 3.52)).toBeCloseTo(-16.19, 2);
  });

  it('is zero when the level is the open itself', () => {
    expect(percentVsOpen(4.2, 4.2)).toBe(0);
  });

  it('returns null while the session is not entered', () => {
    expect(percentVsOpen(null, 4.62)).toBeNull();
    expect(percentVsOpen(4.2, null)).toBeNull();
  });
});
