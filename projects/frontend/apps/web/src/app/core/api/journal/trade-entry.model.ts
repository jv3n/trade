import { Pattern } from '../shared/pattern.model';

/**
 * Trading-journal **domain** types — consumed by feature components and by the repository
 * port. The wire-format (ISO date strings, ISO instant strings) is **not** exposed here ; the
 * HTTP adapter in `adapters/journal.http.ts` owns the mapping between wire and domain.
 *
 * The string-literal types match the Postgres ENUMs and the Kotlin enums on the backend
 * — they're the shared vocabulary that crosses the wire unchanged.
 */

/** Position direction — matches the backend `trade_direction` enum. */
export type TradeDirection = 'BUY' | 'SHORT';
/** Whether an execution opens/adds (`ENTRY`) or closes/reduces (`EXIT`) the position. */
export type ExecutionKind = 'ENTRY' | 'EXIT';
/** Position fill state derived from the executions — see `position-aggregates.ts`. */
export type PositionStatus = 'OPEN' | 'PARTIAL' | 'CLOSED';

/** Derived state for filtering — see backend `TradeStatus` enum. */
export type TradeStatus = 'OPEN' | 'CLOSED' | 'PROFITABLE' | 'LOSING';

export const TRADE_STATUSES: readonly TradeStatus[] = ['OPEN', 'CLOSED', 'PROFITABLE', 'LOSING'];
export const TRADE_DIRECTIONS: readonly TradeDirection[] = ['SHORT', 'BUY'];
export const EXECUTION_KINDS: readonly ExecutionKind[] = ['ENTRY', 'EXIT'];

/**
 * One execution leg of a position : a single fill with its own share count, price and — when the
 * broker statement gives one — fill time (`HH:mm`, the day being the trade's). Ordered by `seq`
 * (0-based) within the parent trade. The `seq` is server-assigned ; on input the order of the
 * array is what matters (the backend re-sequences it).
 */
export interface TradeExecution {
  seq: number;
  kind: ExecutionKind;
  shares: number;
  price: number;
  executedAt: string | null;
}

/** Same as [TradeExecution] minus the server-assigned `seq` — what forms hand to the repository. */
export interface TradeExecutionInput {
  kind: ExecutionKind;
  shares: number;
  price: number;
  executedAt: string | null;
}

/**
 * Filter criteria for listing trades. All fields optional — `null` / empty array = no filter
 * on that axis. The HTTP adapter converts to the wire query-param shape ; consumers (the
 * journal page filter form) stay in domain land with native `Date` / typed arrays.
 */
export interface TradeEntryFilter {
  query?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  patterns?: Pattern[] | null;
  status?: TradeStatus | null;
}

/**
 * One trade (a *position*) in the journal. Dates / instants are native `Date` — adapters parse from
 * wire.
 *
 * A trade is born from a stat : `statEntryId` is mandatory, and `tradeDate` / `ticker` / `pattern`
 * are inherited from that stat (read-only on the trade page). The position itself is built from
 * `direction` + `executions` ; the flat `size` / `openPrice` / `exitPrice` / `profitDollars` /
 * `gainPercent` are **derived aggregates** (read-only — recomputed server-side from the
 * executions), and `durationMinutes` is derived from the fill times.
 *
 * Three P&L figures travel together : `profitDollars` computed from the executions,
 * `realProfitDollars` typed off the broker statement, and `retainedProfitDollars` — the one that
 * reaches the account (real if set, else computed).
 */
export interface TradeEntry {
  id: string;
  statEntryId: string;
  tradeDate: Date;
  ticker: string;
  pattern: Pattern;
  direction: TradeDirection | null;
  executions: TradeExecution[];
  size: number | null;
  openPrice: number | null;
  exitPrice: number | null;
  gainPercent: number | null;
  profitDollars: number | null;
  realProfitDollars: number | null;
  retainedProfitDollars: number | null;
  durationMinutes: number | null;
  note: string | null;
  errorNote: string | null;
  /** Whether a screenshot is attached (issue #110). The bytes are served on a dedicated endpoint. */
  hasScreenshot: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input shape — what callers (forms, business code) hand to the repository for create / update.
 * Carries the stat-borne identity, `direction` + `executions` and the real P&L ; the computed
 * aggregates are **not** sent (the backend derives them). Dates stay as native `Date` — the adapter
 * serialises to wire format.
 */
export interface TradeEntryInput {
  statEntryId: string;
  tradeDate: Date;
  ticker: string;
  pattern: Pattern | null;
  direction: TradeDirection | null;
  executions: TradeExecutionInput[];
  realProfitDollars: number | null;
  note: string | null;
  errorNote: string | null;
}
