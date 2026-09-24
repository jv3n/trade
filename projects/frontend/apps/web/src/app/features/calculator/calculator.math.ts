import { percentChange } from '../../shared/percent/percent';

/**
 * The calculator's arithmetic (#388) — pure, so each card is a function of what is typed. Every
 * function returns **null while an input is missing or not positive**, so the card shows « — »
 * rather than `0` or `NaN`. The short-side checks return `'wrong-side'` : a stop under the entry is
 * a mistake to point out, never a negative share count.
 */

export type WrongSide = 'wrong-side';
/** The stop is so far that the risk doesn't cover a single share. */
export type TooFar = 'too-far';

/** Signed move from [from] to [to], in whole percent (`3.23 → 2.70` = −16.4). */
export function percentMove(from: number | null, to: number | null): number | null {
  return to !== null && to > 0 ? percentChange(from, to) : null;
}

/** The price [percent] away from [base] — what is 20 % below 3.23. */
export function priceAfterMove(base: number | null, percent: number | null): number | null {
  if (base === null || !(base > 0) || percent === null) return null;
  return base * (1 + percent / 100);
}

export interface PositionSize {
  shares: number;
  /** The risk the rounded share count actually takes — never quite the one asked for. */
  risk: number;
}

/** Shares a short can take for [risk] dollars between [entry] and a [stop] above it, rounded down. */
export function positionSize(
  risk: number | null,
  entry: number | null,
  stop: number | null,
): PositionSize | WrongSide | TooFar | null {
  if (!allPositive(risk, entry, stop)) return null;
  if (stop! <= entry!) return 'wrong-side';
  const perShare = stop! - entry!;
  const shares = Math.floor(risk! / perShare);
  // « 0 shares · 0.00 $ » is true, but reads like a broken card : say why instead.
  if (shares === 0) return 'too-far';
  return { shares, risk: shares * perShare };
}

export interface ShortPnl {
  dollars: number;
  /** Against the position's value at entry. */
  percent: number;
}

/** What a short made, entered at [entry] and covered at [cover], fees included. */
export function shortPnl(
  entry: number | null,
  cover: number | null,
  shares: number | null,
  fees: number | null,
): ShortPnl | null {
  if (!allPositive(entry, cover, shares)) return null;
  const dollars = (entry! - cover!) * shares! - (fees ?? 0);
  return { dollars, percent: (dollars / (entry! * shares!)) * 100 };
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

export interface ScaleIn {
  average: number;
  shares: number;
}

/** The average price once [addShares] at [addPrice] join [shares] at [price]. */
export function averageAfterAdd(
  shares: number | null,
  price: number | null,
  addShares: number | null,
  addPrice: number | null,
): ScaleIn | null {
  if (!allPositive(shares, price, addShares, addPrice)) return null;
  const total = shares! + addShares!;
  return { average: (shares! * price! + addShares! * addPrice!) / total, shares: total };
}

export function isDistance(d: Distance | WrongSide | null): d is Distance {
  return d !== null && d !== 'wrong-side';
}

function allPositive(...values: (number | null)[]): boolean {
  return values.every((v) => v !== null && v > 0);
}
