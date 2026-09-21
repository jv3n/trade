import { percentChange } from '../../shared/percent/percent';

/**
 * Pure math behind the **candidates** feature — the three figures derived from the morning capture
 * (cf. `mockup/PARCOURS.md`, step 1). Never stored : the page recomputes them from the captured
 * prices, both for the live preview while typing and for the day's list.
 *
 * Results are **whole-number percentages** (`52.8` = +52.8 %) and `null` when an input is missing or
 * the base is not positive (see [percentChange]).
 */

/** Gap % = (PM open − previous close) ÷ previous close. */
export function gapPercent(previousClose: number | null, pmOpen: number | null): number | null {
  return percentChange(previousClose, pmOpen);
}

/** Push % = (PM high − PM open) ÷ PM open — how far the premarket already ran above its open. */
export function pushPercent(pmOpen: number | null, pmHigh: number | null): number | null {
  return percentChange(pmOpen, pmHigh);
}

/** Locate / price = locate ÷ PM open — the weight of the borrow cost against the share price. */
export function locatePercent(locatePerShare: number | null, pmOpen: number | null): number | null {
  if (locatePerShare === null || pmOpen === null || !(pmOpen > 0)) return null;
  return (locatePerShare / pmOpen) * 100;
}

/**
 * Target price = open × (1 + push %) — where the push that follows the open usually tops out, with
 * [pushPercent] the average push at the open of the completed stats.
 */
export function targetPrice(open: number | null, pushPercent: number | null): number | null {
  if (open === null || pushPercent === null || !(open > 0)) return null;
  return open * (1 + pushPercent / 100);
}

/**
 * Locate / price above which the borrow cost is flagged as a **warning** (amber) — the mockup
 * flags SGBX at 6.5 % while 1–2 % reads as normal.
 */
export const EXPENSIVE_LOCATE_PERCENT = 5;
