import { describe, expect, it } from 'vitest';
import {
  averageAfterAdd,
  percentMove,
  positionSize,
  priceAfterMove,
  riskReward,
  shortPnl,
  stopDistance,
  targetDistance,
} from './calculator.math';

/**
 * The calculator's sums (#388), on the figures a GUS short actually meets. Each card reads « — »
 * until it has what it needs, so every function answers null on a missing or non-positive input
 * rather than a `0` or a `NaN`, and the short-side checks name a stop on the wrong side instead of
 * computing a negative share count from it.
 */
describe('calculator math', () => {
  describe('percentMove', () => {
    it('reads the signed move from one price to the other', () => {
      expect(percentMove(3.23, 2.7)).toBeCloseTo(-16.41, 2);
      expect(percentMove(2.7, 3.23)).toBeCloseTo(19.63, 2);
    });

    it('waits for both prices', () => {
      expect(percentMove(3.23, null)).toBeNull();
      expect(percentMove(null, 2.7)).toBeNull();
      expect(percentMove(0, 2.7)).toBeNull();
    });
  });

  describe('priceAfterMove', () => {
    it('finds the price a percent away, down or up', () => {
      expect(priceAfterMove(3.23, -20)).toBeCloseTo(2.584, 3);
      expect(priceAfterMove(2.5, 10)).toBeCloseTo(2.75, 3);
    });

    it('takes a zero move as the price itself, and waits for the price', () => {
      expect(priceAfterMove(3.23, 0)).toBe(3.23);
      expect(priceAfterMove(null, -20)).toBeNull();
    });
  });

  describe('positionSize', () => {
    it('rounds the share count down, and gives the risk that count really takes', () => {
      // 100 $ over 0.22 $ a share is 454.5 : half a share can't be shorted.
      const size = positionSize(100, 3.23, 3.45);

      expect(size).toEqual({ shares: 454, risk: expect.closeTo(99.88, 2) });
    });

    it('names a stop at or under the entry rather than sizing from it', () => {
      expect(positionSize(100, 3.23, 3.0)).toBe('wrong-side');
      expect(positionSize(100, 3.23, 3.23)).toBe('wrong-side');
    });

    // A risk smaller than what one share stands to lose : 0.50 $ against 0.80 $ up to this stop.
    it('says the stop is too far rather than answering zero shares', () => {
      expect(positionSize(0.5, 3.2, 4.0)).toBe('too-far');
    });

    it('waits for the risk, the entry and the stop', () => {
      expect(positionSize(null, 3.23, 3.45)).toBeNull();
    });
  });

  describe('shortPnl', () => {
    it('gains when the cover is under the entry, fees taken off', () => {
      const pnl = shortPnl(3.23, 2.7, 454, 4.5)!;

      expect(pnl.dollars).toBeCloseTo(236.12, 2);
      expect(pnl.percent).toBeCloseTo(16.1, 1);
    });

    it('loses when the cover is above the entry', () => {
      expect(shortPnl(3.23, 3.45, 454, null)!.dollars).toBeCloseTo(-99.88, 2);
    });

    it('treats the fees as optional, but not the shares', () => {
      expect(shortPnl(3.23, 2.7, 454, null)!.dollars).toBeCloseTo(240.62, 2);
      expect(shortPnl(3.23, 2.7, null, 4.5)).toBeNull();
    });
  });

  describe('stopDistance / targetDistance / riskReward', () => {
    it('measures the stop above and the target below, signed like a move', () => {
      expect(stopDistance(3.1, 3.45)).toEqual({
        percent: expect.closeTo(11.29, 2),
        dollars: expect.closeTo(0.35, 4),
      });
      expect(targetDistance(3.1, 2.5)).toEqual({
        percent: expect.closeTo(-19.35, 2),
        dollars: expect.closeTo(0.6, 4),
      });
    });

    it('reads the stop before any target is decided', () => {
      expect(stopDistance(3.1, 3.45)).not.toBeNull();
      expect(riskReward(3.1, 3.45, null)).toBeNull();
    });

    it('gives the reward per unit of risk once both sides hold', () => {
      expect(riskReward(3.1, 3.45, 2.5)).toBeCloseTo(1.71, 2);
    });

    it('names each side on its own when it is wrong', () => {
      expect(stopDistance(3.1, 3.0)).toBe('wrong-side');
      expect(targetDistance(3.1, 3.2)).toBe('wrong-side');
      expect(riskReward(3.1, 3.0, 2.5)).toBeNull();
    });
  });

  describe('averageAfterAdd', () => {
    it('weighs each entry by its shares', () => {
      expect(averageAfterAdd(200, 3.1, 150, 3.4)).toEqual({
        average: expect.closeTo(3.2286, 4),
        shares: 350,
      });
    });

    it('waits for both entries', () => {
      expect(averageAfterAdd(200, 3.1, null, 3.4)).toBeNull();
    });
  });
});
