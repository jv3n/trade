import { percentChange } from '../../shared/percent/percent';

/**
 * The calculator's arithmetic (#388) — pure, so each card is a function of what is typed. Every
 * function returns **null while an input is missing or not positive**, so the card shows « — »
 * rather than `0` or `NaN`. The short-side checks return `'wrong-side'` : a stop under the price is
 * a mistake to point out, never a negative distance.
 */

export type WrongSide = 'wrong-side';
/** The stop is so far that the risk doesn't cover a single share. */
export type TooFar = 'too-far';
/** The stop sits at or under the first entry level : there is no level left to short from. */
export type NoLevel = 'no-level';

/** Signed move from [from] to [to], in whole percent (`3.23 → 2.70` = −16.4). */
export function percentMove(from: number | null, to: number | null): number | null {
  return to !== null && to > 0 ? percentChange(from, to) : null;
}

/** The price [percent] away from [base] — what is 20 % below 3.23. */
export function priceAfterMove(base: number | null, percent: number | null): number | null {
  if (base === null || !(base > 0) || percent === null) return null;
  return base * (1 + percent / 100);
}

/** The entry levels of the position size's ladder, in % above the open (#496). */
export const ENTRY_LEVELS: readonly number[] = [5, 7, 10, 15, 20, 25, 30];

/** The dollars a risk of [percent] of the [balance] stands for. */
export function riskInDollars(balance: number | null, percent: number | null): number | null {
  return allPositive(balance, percent) ? (balance! * percent!) / 100 : null;
}

/** The stop price [stopPercent] above the [open]. */
export function stopPrice(open: number | null, stopPercent: number | null): number | null {
  return allPositive(open, stopPercent) ? open! * (1 + stopPercent! / 100) : null;
}

export interface LadderRow {
  /** % above the open. */
  level: number;
  price: number;
  /** Rounded down : half a share can't be shorted. */
  shares: number;
  /** The position's value at that entry. */
  engaged: number;
  /** The margin the broker holds for it — `shares × max(price, floor)` (#496). */
  margin: number;
}

/**
 * How many shares a short can take at each entry level above the [open] so that a stop
 * [stopPercent] above the open costs [risk] dollars at most — `risk ÷ (stop − entry)`, keyed off
 * the open like the rest of the app (#496). A level at or above the stop has no row, and neither
 * has one where the risk doesn't cover a single share.
 */
export function entryLadder(
  risk: number | null,
  open: number | null,
  stopPercent: number | null,
  floor: number | null,
): LadderRow[] | NoLevel | TooFar | null {
  if (!allPositive(risk, open, stopPercent)) return null;
  const levels = ENTRY_LEVELS.filter((level) => level < stopPercent!);
  if (levels.length === 0) return 'no-level';
  const rows = levels
    .map((level) => {
      const price = open! * (1 + level / 100);
      const shares = Math.floor(risk! / ((open! * (stopPercent! - level)) / 100));
      return {
        level,
        price,
        shares,
        engaged: shares * price,
        margin: shares * marginPerShare(price, floor),
      };
    })
    .filter((row) => row.shares > 0);
  return rows.length > 0 ? rows : 'too-far';
}

/** The current price is at or above the stop : the short is invalidated, no level is one to take. */
export type AboveStop = 'above-stop';

/**
 * The level of [rows] closest to where [current] stands against the [open] — none without a price,
 * nor under the open, and `'above-stop'` at or past the stop : pointing at a row there would say
 * « take this one » to a trade that is already over (review of #498).
 */
export function nearestLevel(
  rows: readonly LadderRow[],
  open: number | null,
  current: number | null,
  stopPercent: number | null,
): number | AboveStop | null {
  const move = percentMove(open, current);
  if (move === null || move < 0 || rows.length === 0) return null;
  // 0.70 over 0.50 reads 39.999… % : a price right on the stop must count as reaching it.
  if (stopPercent !== null && move >= stopPercent - 1e-9) return 'above-stop';
  return rows.reduce((best, row) =>
    Math.abs(row.level - move) < Math.abs(best.level - move) ? row : best,
  ).level;
}

/**
 * The margin one short share takes (#496) : TradeZero charges a **flat amount per share** under a
 * floor, whatever the share costs — 1 000 shares at $1.50 hold $5 000, not $1 500. A floor of 0 (or
 * none) leaves the margin on the price.
 */
export function marginPerShare(price: number, floor: number | null): number {
  return Math.max(price, floor ?? 0);
}

/** `balance × leverage`, less the [safety] % kept so a floor moved overnight doesn't refuse it. */
export function usableBuyingPower(
  balance: number | null,
  leverage: number | null,
  safety: number | null,
): number | null {
  if (!allPositive(balance, leverage)) return null;
  return balance! * leverage! * (1 - (safety ?? 0) / 100);
}

/** The broker settings the sizing calculators model — editable, since the broker changes them. */
export interface BrokerRules {
  leverage: number | null;
  /** $ per share ; 0 or null, a margin on the price with no floor. */
  floor: number | null;
  /** Shares : locates and orders go by the lot. */
  lot: number | null;
  /** % of the buying power left unused. */
  safety: number | null;
}

export interface MaxSize {
  /** Rounded down to the lot : rounding up is how the order comes back refused. */
  shares: number;
  /** Which cap bound : the margin, or the ceiling in % of the balance. */
  bound: 'margin' | 'ceiling';
  /** The shares the margin alone allows, before the lot — the figure the « bound » line names. */
  marginCap: number;
  /** `max(price, floor)` — what one share takes. */
  perShare: number;
  value: number;
  /** The value against the balance — often well under the ceiling on a cheap stock. */
  balancePercent: number;
  margin: number;
  /** Before the safety margin : what is really left for a second position. */
  buyingPowerLeft: number;
  /** Null until a locate cost is typed. */
  locateCost: number | null;
  locatePercent: number | null;
}

/** Not even one lot fits. */
export type UnderLot = 'under-lot';

/**
 * The largest short the broker will accept on a stock at [price] (#496) : the margin cap
 * `usable buying power ÷ max(price, floor)`, under an optional [ceiling] in % of the balance, rounded
 * down to the lot. An empty ceiling caps nothing.
 */
export function maxSize(
  balance: number | null,
  price: number | null,
  rules: BrokerRules,
  ceiling: number | null,
  locate: number | null,
): MaxSize | UnderLot | null {
  const usable = usableBuyingPower(balance, rules.leverage, rules.safety);
  if (usable === null || !allPositive(price)) return null;
  const perShare = marginPerShare(price!, rules.floor);
  const byMargin = usable / perShare;
  const byCeiling =
    ceiling !== null && ceiling > 0 ? (balance! * ceiling) / 100 / price! : Infinity;
  const lot = rules.lot !== null && rules.lot > 0 ? rules.lot : 1;
  const shares = Math.floor(Math.min(byMargin, byCeiling) / lot) * lot;
  if (shares === 0) return 'under-lot';
  const value = shares * price!;
  const margin = shares * perShare;
  const locateCost = locate !== null && locate >= 0 ? shares * locate : null;
  return {
    shares,
    bound: byMargin <= byCeiling ? 'margin' : 'ceiling',
    marginCap: Math.floor(byMargin),
    perShare,
    value,
    balancePercent: (value / balance!) * 100,
    margin,
    buyingPowerLeft: balance! * rules.leverage! - margin,
    locateCost,
    locatePercent: locateCost !== null ? (locateCost / value) * 100 : null,
  };
}

export interface Distance {
  /** Signed like a move : positive up to the stop, negative down to the target. */
  percent: number;
  /** In $ per share. */
  dollars: number;
}

/** How far a short sits from its [stop] above — needs no target, so it reads from two fields. */
export function stopDistance(
  price: number | null,
  stop: number | null,
): Distance | WrongSide | null {
  if (!allPositive(price, stop)) return null;
  if (stop! <= price!) return 'wrong-side';
  const risk = stop! - price!;
  return { percent: (risk / price!) * 100, dollars: risk };
}

/** How far a short sits from its [target] below. */
export function targetDistance(
  price: number | null,
  target: number | null,
): Distance | WrongSide | null {
  if (!allPositive(price, target)) return null;
  if (target! >= price!) return 'wrong-side';
  const reward = price! - target!;
  return { percent: (-reward / price!) * 100, dollars: reward };
}

/** Reward per unit of risk — the `2.4` of « 1 : 2.4 » ; null until both sides hold. */
export function riskReward(
  price: number | null,
  stop: number | null,
  target: number | null,
): number | null {
  const toStop = stopDistance(price, stop);
  const toTarget = targetDistance(price, target);
  if (!isDistance(toStop) || !isDistance(toTarget)) return null;
  return toTarget.dollars / toStop.dollars;
}

export function isDistance(d: Distance | WrongSide | null): d is Distance {
  return d !== null && d !== 'wrong-side';
}

function allPositive(...values: (number | null)[]): boolean {
  return values.every((v) => v !== null && v > 0);
}
