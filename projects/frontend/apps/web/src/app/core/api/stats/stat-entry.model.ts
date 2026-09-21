import { Pattern } from '../shared/pattern.model';

/**
 * Stats **domain** types — a candidate promoted to the stats sheet, filled as the day goes and
 * ticked once complete (cf. `mockup/PARCOURS.md`, steps 2 and 5). The wire format (ISO date / instant strings) is not
 * exposed here ; the HTTP adapter in `adapters/stats.http.ts` owns the mapping.
 *
 * Two blocks : the **premarket** one is copied from the candidate at promotion time, the **session**
 * one is typed field by field, any of its prices may still be null. No percentage is stored : gap,
 * premarket push and the session percentages are derived by `features/stats/stats.math`.
 */
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
  locatePerShare: number | null;
  note: string | null;

  // ---- Session (null while the stat is to complete) ----
  /** Session open — the base of every session percentage. */
  openPrice: number | null;
  /** Price reached by the push that follows the open. */
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;

  // ---- Flags ----
  ssr: boolean;
  under1Dollar: boolean;
  entryAfter11am: boolean;
  /** Ticked by the owner (#263) — needs the five session prices, which alone don't tick it. */
  completed: boolean;

  // ---- Journal link (#193) ----
  /** The trade this stat gave birth to — one at most. Null = the row offers the « → Trade » action. */
  tradeId: string | null;
  /** That trade's retained P&L, what the link is labelled with. Null while its position is open. */
  tradeRetainedProfitDollars: number | null;

  createdAt: Date;
  updatedAt: Date;
}

/** Update payload — the completion panel sends the whole row back (premarket + session + flags). */
export type StatEntryInput = Omit<
  StatEntry,
  | 'id'
  | 'candidateId'
  | 'completed'
  | 'tradeId'
  | 'tradeRetainedProfitDollars'
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
}

/**
 * KPIs of the stats page, computed by the backend over the **filtered set** (not the current page).
 * Averages and quantiles cover the completed stats only and are percentages vs the session open ;
 * they are null when no completed stat matches.
 */
export interface StatSummary {
  completed: number;
  toComplete: number;
  averagePushOpenPercent: number | null;
  /** Median, 3rd quartile and max push at the open — the « À l'open » card's references. */
  medianPushOpenPercent: number | null;
  thirdQuartilePushOpenPercent: number | null;
  maxPushOpenPercent: number | null;
  averageLodPercent: number | null;
  /** Completed stats whose EOD closed below the open — the GUS thesis playing out. */
  fadeCount: number;
  averageEodPercent: number | null;
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
