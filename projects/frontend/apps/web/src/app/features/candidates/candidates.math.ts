/**
 * Pure math behind the **candidates** feature — the three figures derived from the morning capture
 * (cf. `mockup/PARCOURS.md › Étape 1`). Never stored : the page recomputes them from the captured
 * prices, both for the live preview while typing and for the day's list.
 *
 * Results are **whole-number percentages** (`52.8` = +52.8 %). Every function returns `null` rather
 * than `NaN` / `Infinity` when an input is missing or the base is not positive, so the UI can show a
 * neutral "—" instead of a broken number.
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
 * Locate / price above which the borrow cost is flagged as a **warning** (amber) — the mockup
 * flags SGBX at 6.5 % while 1–2 % reads as normal.
 */
export const EXPENSIVE_LOCATE_PERCENT = 5;

function percentChange(base: number | null, value: number | null): number | null {
  if (base === null || value === null || !(base > 0)) return null;
  return ((value - base) / base) * 100;
}
