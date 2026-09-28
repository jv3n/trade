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

/** The extension a double top needs, per `docs/pattern/DT.md` — under it, the leg is amber. */
export const DT_EXTENSION_CRITERION = 50;
/** The rejection that makes a double top — under it, a normal breath rather than a rejection. */
export const DT_REJECTION_CRITERION = 17;

/** The three legs of a double top (`docs/pattern/DT.md`), each null until its two prices are in. */
export interface DoubleTopLegs {
  /** A, the extension : start → top. */
  extension: number | null;
  /** A counted from the previous close — a gap plus a push can make 50 % without an intraday 50 %. */
  extensionWithGap: number | null;
  /** B, the rejection : top → rejection low (negative). */
  rejection: number | null;
  /** C, the retest : rejection low → retest. */
  retest: number | null;
  /** Where the retest ended against the top — negative under it, zero or more = the top taken back. */
  retestToTop: number | null;
}

/**
 * TradeZero's extended session — the bounds of a double top's times (#469) : a premarket DT is
 * real, a 02:10 is a typo. The backend refuses the same.
 */
export const DT_SESSION_OPENS = '04:00';
export const DT_SESSION_CLOSES = '20:00';

/** How long each leg of a double top took (#469), in minutes — null until both its times are in. */
export interface DoubleTopDurations {
  /** A : start → top. */
  rise: number | null;
  /** B : top → rejection low — how fast the rejection comes, the leg the entry depends on. */
  rejection: number | null;
  /** C : rejection low → retest. */
  retest: number | null;
  /** Start → retest. */
  total: number | null;
}

/** Minutes from one `HH:mm` to another — null when either is missing or [to] comes first. */
export function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const minutes = toMinutes(to) - toMinutes(from);
  return minutes >= 0 ? minutes : null;
}

export function doubleTopDurations(times: {
  dtStartTime: string | null;
  dtTopTime: string | null;
  dtLowTime: string | null;
  dtRetestTime: string | null;
}): DoubleTopDurations {
  const { dtStartTime: start, dtTopTime: top, dtLowTime: low, dtRetestTime: retest } = times;
  return {
    rise: minutesBetween(start, top),
    rejection: minutesBetween(top, low),
    retest: minutesBetween(low, retest),
    total: minutesBetween(start, retest),
  };
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function doubleTopLegs(prices: {
  previousClose: number | null;
  dtStartPrice: number | null;
  dtTopPrice: number | null;
  dtLowPrice: number | null;
  dtRetestPrice: number | null;
}): DoubleTopLegs {
  const { previousClose, dtStartPrice: start, dtTopPrice: top, dtLowPrice: low } = prices;
  const retest = prices.dtRetestPrice;
  return {
    extension: percentChange(start, top),
    extensionWithGap: percentChange(previousClose, top),
    rejection: percentChange(top, low),
    retest: percentChange(low, retest),
    retestToTop: percentChange(top, retest),
  };
}
