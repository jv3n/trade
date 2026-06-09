/**
 * Trade-stats **domain** types — consumed by the stats feature page and by the [StatsRepository]
 * port. The wire format (ISO date / instant strings) is **not** exposed here ; the HTTP adapter in
 * `adapters/stats.http.ts` owns the mapping between wire and domain.
 *
 * Mirrors the backend `stat_entry` table : the manual setup + price levels plus the three derived
 * percentages (`pushPercent` / `lodPercent` / `eodPercent`, computed server-side at import). The
 * dataset is **global** — there is no per-user scoping, every authenticated user reads the same rows.
 */

/** One stats row. `tradeDate` / `createdAt` / `updatedAt` are native `Date` — adapters parse wire. */
export interface StatEntry {
  id: string;
  tradeDate: Date;
  ticker: string;
  gapUpPercent: number;
  floatSharesMillions: number;
  institutionsPercent: number;
  instOver20: boolean;
  under1Dollar: boolean;
  ssr: boolean;
  entryAfter11am: boolean;
  note: string | null;
  openPrice: number;
  highPrice: number;
  lodPrice: number;
  eodPrice: number;
  /** Derived server-side : `(high - open) / open * 100`. Can be negative. */
  pushPercent: number;
  /** Derived server-side : `(lod - open) / open * 100`. Can be negative. */
  lodPercent: number;
  /** Derived server-side : `(eod - open) / open * 100`. Can be negative. */
  eodPercent: number;
  createdAt: Date;
  updatedAt: Date;
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
