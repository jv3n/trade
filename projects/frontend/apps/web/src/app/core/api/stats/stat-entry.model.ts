import { TradeDirection } from '../journal/trade-entry.model';
import { Pattern } from '../shared/pattern.model';

/**
 * Stats **domain** types — a candidate promoted to the stats sheet, filled as the day goes and
 * ticked once complete (cf. `mockup/PARCOURS.md`, steps 2 and 5). The wire format (ISO date / instant strings) is not
 * exposed here ; the HTTP adapter in `adapters/stats.http.ts` owns the mapping.
 *
 * Two blocks : the **premarket** one is copied from the candidate at promotion time, the **session**
 * one is typed field by field, any of its prices may still be null — the five GUS prices, or the
 * four prices of a double top for a DT stat. No percentage is stored : gap, premarket push, the
 * session percentages and the double top legs are derived by `features/stats/stats.math`.
 */
/** Why a stat was not the setup (#499) : a DT whose retest took the top, a price off the sheet. */
export type OutOfPatternReason = 'RETEST_TOOK_TOP' | 'PRICE_OUT_OF_RANGE';

export interface StatEntry {
  id: string;
  /** The candidate this stat came from — null once that candidate is deleted. */
  candidateId: string | null;
  tradeDate: Date;
  pattern: Pattern;
  ticker: string;

  // ---- Premarket (copied from the candidate) ----
  previousClose: number;
  pmOpen: number;
  pmHigh: number;
  floatMillions: number | null;
  volumeMillions: number | null;
  note: string | null;

  // ---- Session (null while the stat is to complete) ----
  /** Session open — the base of every session percentage. */
  openPrice: number | null;
  /** Price reached by the push that follows the open. */
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;

  // ---- Double top (a DT stat only — null on any other pattern) ----
  /** Where the push starts — the open by default, a later low when the push starts from there. */
  dtStartPrice: number | null;
  dtTopPrice: number | null;
  /** The low of the rejection off the top. */
  dtLowPrice: number | null;
  /** The high of the retest, back toward the top. */
  dtRetestPrice: number | null;
  /**
   * When each of the four prices printed (#469) — `HH:mm`, wall-clock on [tradeDate], in order
   * from start to retest. The legs' durations come from them.
   */
  dtStartTime: string | null;
  dtTopTime: string | null;
  dtLowTime: string | null;
  dtRetestTime: string | null;

  // ---- Flags ----
  ssr: boolean;
  /** Opened under a dollar — derived from the open by the backend (#499), never typed. */
  under1Dollar: boolean;
  /** Ticked on a GUS ; derived from the retest time on a double top (#499). */
  /** The stock never pushed after the open (#302) — [pushOpenPrice] stays null. */
  noPush: boolean;
  /** Less than 20 % of the float held by institutions (#349) — the threshold lives in the label. */
  highInstitutions: boolean;
  /**
   * Ticked by the owner (#263) — needs the five session prices (four on a no-push day, the four
   * double top prices and their times on a DT), which alone don't tick it.
   */
  completed: boolean;
  /**
   * Why the recorded prices say this was not the setup (#499) — empty when nothing does. Computed by
   * the backend, never ticked ; the stat still counts in every KPI.
   */
  outOfPattern: OutOfPatternReason[];

  // ---- Journal link (#193) ----
  /**
   * The trades born from this stat, in the day's order (#500). Empty = the row offers « → Trade » ;
   * otherwise one tag per trade, and « + » for the next one.
   */
  trades: StatTradeLink[];

  createdAt: Date;
  updatedAt: Date;
}

/** A trade of a stat, as the stats row and the trade sheet's header show it. */
export interface StatTradeLink {
  tradeId: string;
  /** Null until the trade's first execution is typed in. */
  direction: TradeDirection | null;
  /** The P&L that counts — real if typed, else computed. Null while the trade is open. */
  retainedProfitDollars: number | null;
}

/** Update payload — the completion panel sends the whole row back (premarket + session + flags). */
export type StatEntryInput = Omit<
  StatEntry,
  | 'id'
  | 'candidateId'
  | 'completed'
  | 'under1Dollar'
  | 'outOfPattern'
  | 'trades'
  | 'createdAt'
  | 'updatedAt'
>;

/** Completion status a listing can be narrowed to. Mirrors the backend `StatStatus`. */
export type StatStatus = 'TO_COMPLETE' | 'COMPLETED';

/**
 * Filter criteria for the stats listing — mirrors the backend `StatEntryFilter`. All optional ;
 * omitted axes = no filter.
 */
export interface StatEntryFilter {
  query?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  pattern?: Pattern | null;
  status?: StatStatus | null;
  /** True keeps the no-push days only. */
  noPush?: boolean | null;
  /** True keeps the stats flagged out of pattern only (#499) — combines with every other axis. */
  outOfPattern?: boolean | null;
  /** True keeps the stats opened under a dollar only (#499). */
  under1Dollar?: boolean | null;
}

/**
 * KPIs of the stats page, computed by the backend over the **filtered set** (not the current page).
 * The session cards read medians (#499) — one or two big movers dragged the averages. Medians,
 * averages and quantiles cover the completed stats only and are whole-number percentages ; they
 * are null when no completed stat matches. The session figures read the GUS-measured stats, the
 * double top figures the DT stats only.
 */
export interface StatSummary {
  completed: number;
  toComplete: number;
  averagePushOpenPercent: number | null;
  /** Median, 3rd quartile and max push at the open — the « À l'open » card's references. */
  medianPushOpenPercent: number | null;
  thirdQuartilePushOpenPercent: number | null;
  maxPushOpenPercent: number | null;
  /** Completed stats ticked « no push » — they stay out of the push figures above. */
  noPushCount: number;
  medianLodPercent: number | null;
  /** Completed stats whose EOD closed below the open — the GUS thesis playing out. */
  fadeCount: number;
  medianEodPercent: number | null;
  /** Median hold, PM high → open (#499) : what survives of the premarket at the bell. */
  medianHoldPercent: number | null;
  /** Median previous close → PM high — the highest the scanner showed that morning. */
  medianCumulativePmHighPercent: number | null;
  /** Median previous close → open — what the scanner still showed at the bell. */
  medianCumulativeOpenPercent: number | null;
  /** Completed stats that are double tops — part of [completed]. */
  completedDoubleTops: number;
  /** Leg A, start → top. */
  averageExtensionPercent: number | null;
  /** Leg A counted from the previous close. */
  averageExtensionWithGapPercent: number | null;
  /** Leg B, top → rejection low (negative). */
  averageRejectionPercent: number | null;
  /** Double tops whose rejection reached the 17 % of the DT sheet. */
  rejectionAtCriterionCount: number;
  /** Leg C, rejection low → retest. */
  averageRetestPercent: number | null;
  /** Where the retest ended against the top — negative under it. */
  averageRetestToTopPercent: number | null;
  /** Double tops whose retest took the top back. */
  retestTookTopCount: number;
  /**
   * Median duration of the completed double tops, start → retest, in minutes (#469) — a median, so
   * one DT that drags all afternoon does not move the typical figure. Null without any.
   */
  medianDoubleTopMinutes: number | null;
  /** Median of leg B, top → rejection low, in minutes — how fast the rejection comes. */
  medianRejectionMinutes: number | null;
  /** Stats of the filtered set that gave birth to a trade — the journal reads « traded / all ». */
  traded: number;
  untraded: number;
}

/**
 * Page coordinates the adapter forwards to the backend. `sortField` / `sortDirection` are optional ;
 * omit them to inherit the backend's default sort (`tradeDate desc, createdAt desc`).
 */
export interface PageRequest {
  pageIndex: number;
  pageSize: number;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

/** Subset of Spring's `Page<T>` shape that the UI cares about. */
export interface PagedResult<T> {
  content: T[];
  pageIndex: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}
