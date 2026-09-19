import { percentChange } from '../../shared/percent/percent';

/**
 * Pure math behind the **stats** feature. Nothing is stored : the premarket figures are recomputed
 * from the prices copied off the candidate, and every session figure is measured against the
 * session open — the base of the whole sheet (cf. `mockup/PARCOURS.md`, step 5).
 *
 * Results are **whole-number percentages** (`10.0` = +10.0 %) and `null` when a price is missing or
 * the base is not positive (see [percentChange]). The backend mirrors these formulas in
 * `StatMetrics` for the KPIs.
 */

/** Gap % = (PM open − previous close) ÷ previous close. */
export function gapPercent(previousClose: number | null, pmOpen: number | null): number | null {
  return percentChange(previousClose, pmOpen);
}

/** Premarket push % = (PM high − PM open) ÷ PM open. */
export function pmPushPercent(pmOpen: number | null, pmHigh: number | null): number | null {
  return percentChange(pmOpen, pmHigh);
}

/**
 * Any session level against the session open — push at open, HOD, LOD, EOD. Negative means the
 * level sat under the open, which is what a short is after.
 */
export function percentVsOpen(open: number | null, level: number | null): number | null {
  return percentChange(open, level);
}
