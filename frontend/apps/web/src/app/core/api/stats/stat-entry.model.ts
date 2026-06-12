/**
 * Trade-stats **domain** types — consumed by the stats feature page and by the [StatsRepository]
 * port. The wire format (ISO date / instant strings) is **not** exposed here ; the HTTP adapter in
 * `adapters/stats.http.ts` owns the mapping between wire and domain.
 *
 * Mirrors the backend `stat_entry` table : the manual setup + price levels plus the three derived
 * percentages (`pushPercent` / `lodPercent` / `eodPercent`, computed server-side at import).
 *
 * Since V2 the dataset is **admin-global + per-user** : ADMIN CSV imports are the global rows every
 * user reads ([source] `IMPORT`, `createdBy` null) ; a user's radar « Add stat » pick is a partial
 * row owned by and visible only to them ([source] `RADAR`). Everything except the scan-time fields
 * (`ticker` / `gapUpPercent` / `openPrice`) is therefore nullable — a radar pick carries `null` for
 * the setup flags and the EOD outcome until the day plays out.
 */

/**
 * How a [StatEntry] entered the dataset : `IMPORT` (admin CSV, community/global), `RADAR` (one-click
 * from the radar), `MANUAL` (typed in the stats « Add » dialog). RADAR + MANUAL are owned by the
 * current user and are the only rows they may edit / delete.
 */
export type StatSource = 'IMPORT' | 'RADAR' | 'MANUAL';

/** One stats row. `tradeDate` / `createdAt` / `updatedAt` are native `Date` — adapters parse wire. */
export interface StatEntry {
  id: string;
  tradeDate: Date;
  ticker: string;
  gapUpPercent: number;
  openPrice: number;
  floatSharesMillions: number | null;
  institutionsPercent: number | null;
  instOver20: boolean | null;
  under1Dollar: boolean | null;
  ssr: boolean | null;
  entryAfter11am: boolean | null;
  note: string | null;
  highPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  /** Derived server-side : `(high - open) / open * 100`. Can be negative. `null` on a radar pick. */
  pushPercent: number | null;
  /** Derived server-side : `(lod - open) / open * 100`. Can be negative. `null` on a radar pick. */
  lodPercent: number | null;
  /** Derived server-side : `(eod - open) / open * 100`. Can be negative. `null` on a radar pick. */
  eodPercent: number | null;
  source: StatSource;
  /** Owning user id. `null` = the admin/global curated dataset (CSV import), readable by everyone. */
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Payload of the radar « Add stat » button — only the fields a radar pick knows at scan time. The
 * trade date defaults to today server-side, so it is not sent.
 */
export interface RadarStatInput {
  ticker: string;
  gapUpPercent: number;
  openPrice: number;
}

/**
 * Form payload for creating / editing a **user-owned** stat (the « Add » dialog). Mirrors the backend
 * `StatEntryFormRequest` in domain terms (native `Date`). `tradeDate` / `ticker` / `gapUpPercent` /
 * `openPrice` are required ; the rest are the optional setup flags + EOD outcome (null until known).
 * The derived `%push` / `%LOD` / `%EOD` are computed server-side, never sent. [source] is `MANUAL`
 * for the dialog (the radar uses [RadarStatInput] instead).
 */
export interface StatEntryInput {
  tradeDate: Date;
  ticker: string;
  gapUpPercent: number;
  openPrice: number;
  floatSharesMillions: number | null;
  institutionsPercent: number | null;
  instOver20: boolean | null;
  under1Dollar: boolean | null;
  ssr: boolean | null;
  entryAfter11am: boolean | null;
  highPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  note: string | null;
  source: StatSource;
}

/**
 * Filter criteria for the stats listing — mirrors the backend `StatEntryFilter`. All optional ;
 * omitted axes = no filter. `source` narrows to one origin ; `gapMin` / `gapMax` bound the gap-up %.
 */
export interface StatEntryFilter {
  query?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  source?: StatSource | null;
  gapMin?: number | null;
  gapMax?: number | null;
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
