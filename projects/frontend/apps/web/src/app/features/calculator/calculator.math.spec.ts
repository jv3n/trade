import { describe, expect, it } from 'vitest';
import {
  BrokerRules,
  LadderRow,
  MaxSize,
  entryLadder,
  marginPerShare,
  maxSize,
  nearestLevel,
  percentMove,
  priceAfterMove,
  riskInDollars,
  riskReward,
  stopDistance,
  stopPrice,
  targetDistance,
  usableBuyingPower,
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

  describe('riskInDollars / stopPrice', () => {
    it('turns a risk in % of the balance into dollars', () => {
      expect(riskInDollars(4820, 5)).toBeCloseTo(241, 2);
      expect(riskInDollars(null, 5)).toBeNull();
    });

    it('places the stop a percent above the open', () => {
      expect(stopPrice(3.35, 40)).toBeCloseTo(4.69, 2);
      expect(stopPrice(3.35, null)).toBeNull();
    });
  });

  describe('entryLadder', () => {
    // The tracker's own tab : open 3.35, stop +40 %. It rounds to the nearest share ; half a share
    // can't be shorted, so the ladder rounds down.
    it('sizes each entry level above the open against the same stop', () => {
      const rows = entryLadder(500, 3.35, 40, 2.5) as LadderRow[];

      expect(rows.map((r) => r.level)).toEqual([5, 7, 10, 15, 20, 25, 30]);
      expect(rows.at(-1)).toEqual({
        level: 30,
        price: expect.closeTo(4.355, 3),
        shares: 1492,
        engaged: expect.closeTo(6497.66, 2),
        // Above the floor, the margin is the position's value.
        margin: expect.closeTo(6497.66, 2),
      });
      expect(rows[2].shares).toBe(497);
    });

    // A $0.50 open under a $2.50 floor : each share holds $2.50 of margin, five times its price.
    it('holds the floor per share as margin under it, not the price', () => {
      const first = (entryLadder(500, 0.5, 40, 2.5) as LadderRow[])[0];

      expect(first.shares).toBe(2857);
      expect(first.engaged).toBeCloseTo(1499.9, 1);
      expect(first.margin).toBeCloseTo(7142.5, 2);
    });

    it('leaves out the levels at or above the stop', () => {
      const rows = entryLadder(500, 3.35, 20, 2.5) as LadderRow[];

      expect(rows.map((r) => r.level)).toEqual([5, 7, 10, 15]);
    });

    it('names a stop under the first level rather than an empty ladder', () => {
      expect(entryLadder(500, 3.35, 5, 2.5)).toBe('no-level');
    });

    // 0.10 $ of risk against 0.34 $ a share even at +30 %, the level closest to the stop.
    it('says the stop is too far when the risk covers no share at any level', () => {
      expect(entryLadder(0.1, 3.35, 40, 2.5)).toBe('too-far');
    });

    it('waits for the risk, the open and the stop', () => {
      expect(entryLadder(null, 3.35, 40, 2.5)).toBeNull();
      expect(entryLadder(500, null, 40, 2.5)).toBeNull();
    });
  });

  describe('nearestLevel', () => {
    const rows = entryLadder(241, 3.35, 40, 2.5) as LadderRow[];

    it('picks the level closest to where the price stands against the open', () => {
      // 4.02 is +20 % over 3.35 ; 3.60 is +7.5 %, nearer +7 than +10.
      expect(nearestLevel(rows, 3.35, 4.02, 40)).toBe(20);
      expect(nearestLevel(rows, 3.35, 3.6, 40)).toBe(7);
    });

    it('highlights nothing without a current price', () => {
      expect(nearestLevel(rows, 3.35, null, 40)).toBeNull();
    });

    // Review of #498 : open 0.50, stop +40 %, the price at 0.90 still pointed at the +30 % row.
    it('names a price at or past the stop instead of pointing at the last row', () => {
      expect(nearestLevel(rows, 0.5, 0.9, 40)).toBe('above-stop');
      expect(nearestLevel(rows, 0.5, 0.7, 40)).toBe('above-stop');
    });

    it('highlights nothing under the open, where no entry level sits', () => {
      expect(nearestLevel(rows, 0.5, 0.3, 40)).toBeNull();
    });
  });

  describe('marginPerShare / usableBuyingPower', () => {
    // TradeZero's own example : 1 000 shares at $1.50 hold $5 000, not $1 500.
    it('takes the floor per share under it, the price above it', () => {
      expect(1000 * marginPerShare(1.5, 5)).toBe(5000);
      expect(marginPerShare(6.2, 5)).toBe(6.2);
    });

    it('leaves the margin on the price with no floor', () => {
      expect(marginPerShare(0.65, 0)).toBe(0.65);
      expect(marginPerShare(0.65, null)).toBe(0.65);
    });

    it('levers the balance, less the safety margin', () => {
      expect(usableBuyingPower(4820, 2, 5)).toBeCloseTo(9158, 2);
      expect(usableBuyingPower(4820, 2, null)).toBe(9640);
      expect(usableBuyingPower(4820, null, 5)).toBeNull();
    });
  });

  describe('maxSize', () => {
    const rules: BrokerRules = { leverage: 2, floor: 2.5, lot: 100, safety: 5 };

    it('caps a cheap stock by the margin, rounded down to the lot, and says so', () => {
      // 9 158 $ usable over 2.50 $ a share is 3 663 shares : 3 600 in lots of 100.
      expect(maxSize(4820, 0.65, rules, null, 0.012)).toEqual({
        shares: 3600,
        bound: 'margin',
        marginCap: 3663,
        perShare: 2.5,
        value: expect.closeTo(2340, 2),
        balancePercent: expect.closeTo(48.55, 2),
        margin: expect.closeTo(9000, 2),
        buyingPowerLeft: expect.closeTo(640, 2),
        locateCost: expect.closeTo(43.2, 2),
        locatePercent: expect.closeTo(1.85, 2),
      });
    });

    // The issue's case : $20 000 of buying power, a $2.50 floor — the price no longer matters.
    it('gives the same share count at any price under the floor', () => {
      const flat: BrokerRules = { leverage: 2, floor: 2.5, lot: 100, safety: 0 };
      const at = (price: number) => (maxSize(10000, price, flat, null, null) as MaxSize).shares;

      expect([at(0.39), at(0.65), at(1.3)]).toEqual([8000, 8000, 8000]);
    });

    it('lets the ceiling in % of the balance bind when it is the lower cap', () => {
      // 40 % of 4 820 $ at 3.35 $ is 575 shares, far under the 2 733 the margin allows.
      const size = maxSize(4820, 3.35, rules, 40, null) as MaxSize;

      expect(size.shares).toBe(500);
      expect(size.bound).toBe('ceiling');
    });

    it('caps nothing with an empty ceiling, and costs no locate before one is typed', () => {
      const size = maxSize(4820, 3.35, rules, null, null) as MaxSize;

      expect(size.shares).toBe(2700);
      expect(size.locateCost).toBeNull();
    });

    it('sizes on the price alone with a floor of zero', () => {
      const size = maxSize(4820, 0.65, { ...rules, floor: 0 }, null, null) as MaxSize;

      expect(size.perShare).toBe(0.65);
      expect(size.shares).toBe(14000);
    });

    it('says not even one lot fits rather than answering zero', () => {
      expect(maxSize(100, 0.5, rules, null, null)).toBe('under-lot');
    });

    it('waits for the balance, the price and the leverage', () => {
      expect(maxSize(null, 0.65, rules, null, null)).toBeNull();
      expect(maxSize(4820, null, rules, null, null)).toBeNull();
      expect(maxSize(4820, 0.65, { ...rules, leverage: null }, null, null)).toBeNull();
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
});
