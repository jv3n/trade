/**
 * Pure math behind the **candidates** feature — the short-trade preparation cockpit. The components
 * are a thin signal layer on top of these functions, so the formulas and the **null-on-bad-input**
 * contract (no NaN / Infinity ever leaks to the UI) are testable in isolation from Angular.
 *
 * Reproduces the "Trading Desk" spreadsheet the trader keeps by hand: a risk-based entry ladder, a
 * live execution tracker, a cover (exit) ladder, plus the GUS / borrow-fee helpers (recovered from
 * the shelved standalone calculators — the candidate is now their only owner).
 *
 * Every function returns `null` rather than `NaN` / `Infinity` when the inputs can't yield a result
 * (missing field, division by zero). The UI maps that `null` to a neutral hint, never a broken number.
 */

/**
 * Fixed rungs of the entry ladder, as fractions of the open price (reproduces the spreadsheet rows).
 * Positive rungs sit **above** the open — where a short is scaled in / averaged up against an adverse
 * push ; `0` is the open ; negative rungs are the **profit zone** (cover targets, no sizing there).
 * The largest rung (`0.40`) is the canonical stop.
 */
export const ENTRY_LADDER_STEPS = [
  0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.07, 0.05, 0, -0.1, -0.15, -0.2, -0.25, -0.3, -0.35, -0.4,
] as const;

/**
 * Dollar risk budget for the trade : `totalCapital × pctCapitalAtRisk / 100`. `pctCapitalAtRisk` is a
 * whole-number percentage (e.g. `5` for 5 %). Returns `null` when either input is missing.
 */
export function dollarAtRisk(
  totalCapital: number | null,
  pctCapitalAtRisk: number | null,
): number | null {
  if (totalCapital === null || pctCapitalAtRisk === null) return null;
  return (totalCapital * pctCapitalAtRisk) / 100;
}

/** One rung of the planned entry ladder. */
export interface EntryRung {
  /** Rung as a fraction of the open (e.g. `0.35` = +35 %, `-0.1` = −10 %). */
  step: number;
  /** Price at this rung : `open × (1 + step)`. */
  price: number;
  /**
   * Loss per share if stopped out, from this rung up to the stop : `(stopPct − step) × open`. `null`
   * outside the sizing zone (profit zone, the open itself, or at/above the stop).
   */
  riskPerShare: number | null;
  /**
   * Max shares shortable at this rung so a stop-out costs exactly the risk budget. `null` outside the
   * sizing zone. Uses `Math.round` (not floor) to mirror the spreadsheet — sizing is a guideline, not
   * a hard cap, and rounding keeps parity with the trader's existing numbers.
   */
  maxShares: number | null;
  /** Notional engaged at this rung : `maxShares × price`. `null` when `maxShares` is `null`. */
  totalInvestment: number | null;
}

/**
 * Planned entry ladder : for each fixed rung, the price, the per-share risk to the stop, the max
 * shares the risk budget allows, and the notional. The **sizing zone** is the rungs strictly above
 * the open and strictly below the stop (`0 < step < stopPct`) — the open row and the profit zone
 * carry no position to size, and the stop row itself has zero room.
 *
 * Returns an empty array when `openPrice` is missing or non-positive (nothing to price). Prices are
 * still computed for every rung (including the profit zone) when `openPrice` is valid, even if
 * `stopPct` / `riskBudget` are missing — only the sizing columns go `null`.
 */
export function entryLadder(
  openPrice: number | null,
  stopPct: number | null,
  riskBudget: number | null,
): EntryRung[] {
  if (openPrice === null || openPrice <= 0) return [];
  return ENTRY_LADDER_STEPS.map((step) => {
    const price = openPrice * (1 + step);
    const inSizingZone = stopPct !== null && step > 0 && step < stopPct;
    const riskPerShare = inSizingZone ? (stopPct - step) * openPrice : null;
    const maxShares =
      riskPerShare !== null && riskPerShare > 0 && riskBudget !== null
        ? Math.round(riskBudget / riskPerShare)
        : null;
    const totalInvestment = maxShares !== null ? maxShares * price : null;
    return { step, price, riskPerShare, maxShares, totalInvestment };
  });
}

/** One rung of the live execution tracker — the planned rung enriched with the shares actually filled. */
export interface ExecutionRung {
  step: number;
  price: number;
  riskPerShare: number | null;
  maxShares: number | null;
  /** Shares actually short at this rung (trader input, `0` when untouched). */
  sharesInPlay: number;
  /** Risk currently carried at this rung : `sharesInPlay × riskPerShare`. `null` outside the sizing zone. */
  currentRisk: number | null;
  /** Planned headroom left : `maxShares − sharesInPlay`. `null` outside the sizing zone. */
  remaining: number | null;
  /** Notional currently engaged : `sharesInPlay × price`. */
  investment: number;
}

/** Roll-up of the execution tracker across every rung. */
export interface ExecutionSummary {
  rungs: ExecutionRung[];
  totalShares: number;
  totalCurrentRisk: number;
  totalInvestment: number;
  /**
   * Risk budget left : `riskBudget − totalCurrentRisk`. **Negative = over the risk budget.** `null`
   * when no budget is set.
   */
  residual: number | null;
  /** Weighted average short entry price : `totalInvestment / totalShares`. `null` when nothing is filled. */
  averagePosition: number | null;
}

/**
 * Live execution tracker : overlays the shares actually filled (`sharesInPlay`, keyed by rung step)
 * onto the planned `ladder`, then rolls up totals, the residual risk budget and the weighted average
 * position. Missing/untouched rungs default to `0` shares.
 */
export function executionSummary(
  ladder: readonly EntryRung[],
  sharesInPlay: ReadonlyMap<number, number>,
  riskBudget: number | null,
): ExecutionSummary {
  const rungs: ExecutionRung[] = ladder.map((rung) => {
    const shares = sharesInPlay.get(rung.step) ?? 0;
    return {
      step: rung.step,
      price: rung.price,
      riskPerShare: rung.riskPerShare,
      maxShares: rung.maxShares,
      sharesInPlay: shares,
      currentRisk: rung.riskPerShare !== null ? shares * rung.riskPerShare : null,
      remaining: rung.maxShares !== null ? rung.maxShares - shares : null,
      investment: shares * rung.price,
    };
  });
  const totalShares = rungs.reduce((sum, r) => sum + r.sharesInPlay, 0);
  const totalCurrentRisk = rungs.reduce((sum, r) => sum + (r.currentRisk ?? 0), 0);
  const totalInvestment = rungs.reduce((sum, r) => sum + r.investment, 0);
  return {
    rungs,
    totalShares,
    totalCurrentRisk,
    totalInvestment,
    residual: riskBudget !== null ? riskBudget - totalCurrentRisk : null,
    averagePosition: totalShares > 0 ? totalInvestment / totalShares : null,
  };
}

/** A single free-form short entry leg the trader actually filled (any price, not a fixed rung). */
export interface EntryInput {
  entryPrice: number;
  sharesInPlay: number;
}

/** One row of the free-form entry table — its distance from the open, risk to the stop, and notional. */
export interface EntryRow extends EntryInput {
  /** Distance from the open : `(entryPrice − open) / open × 100`. Negative below the open. `null` without a valid open. */
  entryPct: number | null;
  /** Loss per share if stopped out : `stopPrice − entryPrice` (`stopPrice = open × (1 + stopPct)`). `null` without open/stop. */
  riskPerShare: number | null;
  /** Risk carried by the leg : `sharesInPlay × riskPerShare`. `null` without a valid stop. */
  currentRisk: number | null;
  /** Risk as a % of the entry : `riskPerShare / entryPrice × 100`. `null` without a stop or at `entryPrice` 0. */
  riskPct: number | null;
  /** Notional shorted : `sharesInPlay × entryPrice`. */
  investment: number;
}

/** Roll-up of the free-form entry table — the **source of the average short position** for the cover ladder. */
export interface EntrySummary {
  rows: EntryRow[];
  totalShares: number;
  totalCurrentRisk: number;
  totalInvestment: number;
  /** Weighted average short entry price : `totalInvestment / totalShares`. `null` when nothing is filled. */
  averagePosition: number | null;
  /** Average distance from the open : `(averagePosition − open) / open × 100`. `null` when not computable. */
  averagePct: number | null;
  /** Risk on the average position : `(stopPrice − averagePosition) / averagePosition × 100`. `null` when not computable. */
  averageRiskPct: number | null;
}

/**
 * Free-form entry table : the trader logs the actual fill price + shares for each short leg (not bound
 * to a fixed rung, unlike [executionSummary]). Per leg, the distance from the open, the per-share risk
 * to the stop, the dollar risk and the notional ; then the weighted **average position** that the
 * cover ladder scores against, plus its average distance-from-open and risk %.
 *
 * `stopPct` is a fraction (e.g. `0.40` = +40 %), matching [entryLadder]. The stop price is
 * `open × (1 + stopPct)` — short risk runs *up* from the entry to the stop.
 */
export function entrySummary(
  entries: readonly EntryInput[],
  openPrice: number | null,
  stopPct: number | null,
): EntrySummary {
  const stopPrice =
    openPrice !== null && openPrice > 0 && stopPct !== null ? openPrice * (1 + stopPct) : null;
  const rows: EntryRow[] = entries.map(({ entryPrice, sharesInPlay }) => {
    const riskPerShare = stopPrice !== null ? stopPrice - entryPrice : null;
    return {
      entryPrice,
      sharesInPlay,
      entryPct:
        openPrice !== null && openPrice > 0 ? ((entryPrice - openPrice) / openPrice) * 100 : null,
      riskPerShare,
      currentRisk: riskPerShare !== null ? sharesInPlay * riskPerShare : null,
      riskPct: riskPerShare !== null && entryPrice !== 0 ? (riskPerShare / entryPrice) * 100 : null,
      investment: sharesInPlay * entryPrice,
    };
  });
  const totalShares = rows.reduce((sum, r) => sum + r.sharesInPlay, 0);
  const totalCurrentRisk = rows.reduce((sum, r) => sum + (r.currentRisk ?? 0), 0);
  const totalInvestment = rows.reduce((sum, r) => sum + r.investment, 0);
  const averagePosition = totalShares > 0 ? totalInvestment / totalShares : null;
  return {
    rows,
    totalShares,
    totalCurrentRisk,
    totalInvestment,
    averagePosition,
    averagePct:
      averagePosition !== null && openPrice !== null && openPrice > 0
        ? ((averagePosition - openPrice) / openPrice) * 100
        : null,
    averageRiskPct:
      averagePosition !== null && averagePosition !== 0 && stopPrice !== null
        ? ((stopPrice - averagePosition) / averagePosition) * 100
        : null,
  };
}

/** A single cover (buy-to-close) leg the trader plans or executes against the average short position. */
export interface CoverInput {
  exitPrice: number;
  sharesCovered: number;
}

/** One row of the cover ladder, with its gain/loss against the average position. */
export interface CoverRow extends CoverInput {
  /**
   * Gain as a % of the average position : `(averagePosition − exitPrice) / averagePosition × 100`.
   * **Positive = profit on a short** (covered below the entry). `null` when there's no average position.
   */
  pctGainLoss: number | null;
  /** Realised P&L for the leg : `(averagePosition − exitPrice) × sharesCovered`. `null` when no average position. */
  dollarGainLoss: number | null;
}

/** Roll-up of the cover ladder. */
export interface CoverSummary {
  rows: CoverRow[];
  totalShares: number;
  totalDollarGainLoss: number;
  /** Weighted average take-profit : `Σ(exitPrice × shares) / Σshares`. `null` when nothing is covered. */
  averageTp: number | null;
  /** Average gain as a % of the average position, derived from `averageTp`. `null` when not computable. */
  averagePct: number | null;
}

/**
 * Cover (exit) ladder : for each planned/executed cover leg, the % and $ gain/loss against the
 * weighted `averagePosition` (from [executionSummary]), then the weighted-average take-profit and the
 * total realised P&L. On a short, covering **below** the average entry is a gain (positive).
 */
export function coverSummary(
  exits: readonly CoverInput[],
  averagePosition: number | null,
): CoverSummary {
  const hasAvg = averagePosition !== null && averagePosition !== 0;
  const rows: CoverRow[] = exits.map(({ exitPrice, sharesCovered }) => ({
    exitPrice,
    sharesCovered,
    pctGainLoss: hasAvg ? ((averagePosition - exitPrice) / averagePosition) * 100 : null,
    dollarGainLoss: hasAvg ? (averagePosition - exitPrice) * sharesCovered : null,
  }));
  const totalShares = rows.reduce((sum, r) => sum + r.sharesCovered, 0);
  const totalDollarGainLoss = rows.reduce((sum, r) => sum + (r.dollarGainLoss ?? 0), 0);
  const averageTp =
    totalShares > 0
      ? rows.reduce((sum, r) => sum + r.exitPrice * r.sharesCovered, 0) / totalShares
      : null;
  const averagePct =
    hasAvg && averageTp !== null ? ((averagePosition - averageTp) / averagePosition) * 100 : null;
  return { rows, totalShares, totalDollarGainLoss, averageTp, averagePct };
}

/**
 * Borrow-fee rate as a percentage of the entry price : `costPerShare / entryPrice × 100`. On a short,
 * `costPerShare` is the per-share borrow cost — this expresses it relative to the entry so it's
 * comparable across tickers. Returns `null` when an input is missing or the entry price is 0.
 */
export function borrowFeePercent(
  entryPrice: number | null,
  costPerShare: number | null,
): number | null {
  if (entryPrice === null || costPerShare === null || entryPrice === 0) return null;
  return (costPerShare / entryPrice) * 100;
}

/** Breakdown returned by [gusPercent]. */
export interface GusResult {
  /** `openPrice − previousClose`. */
  amount: number;
  /** `(openPrice − previousClose) / previousClose × 100`. Negative on a gap down. */
  percent: number;
}

/**
 * GUS (gap-up short) magnitude — the gap from the previous close to the open, as an absolute amount
 * and a percentage : `(openPrice − previousClose) / previousClose × 100`. Returns `null` when either
 * input is missing or `previousClose` is 0 (guards the division).
 */
export function gusPercent(
  previousClose: number | null,
  openPrice: number | null,
): GusResult | null {
  if (previousClose === null || openPrice === null || previousClose === 0) return null;
  const amount = openPrice - previousClose;
  return { amount, percent: (amount / previousClose) * 100 };
}
