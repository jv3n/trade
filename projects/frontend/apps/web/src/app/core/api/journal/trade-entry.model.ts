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
 * A trade usually comes from a stat, whose `tradeDate` / `ticker` / `pattern` it inherits (read-only
 * on the trade page) ; created on its own (#634), it has a null `statEntryId` and no day context. The position itself is built from
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
  statEntryId: string | null;
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
  /** The retained P&L as a % of the same cost basis as [gainPercent]. */
  retainedGainPercent: number | null;
  durationMinutes: number | null;
  note: string | null;
  errorNote: string | null;
  /** Whether a screenshot is attached (issue #110). The bytes are served on a dedicated endpoint. */
  hasScreenshot: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One row of the journal (#500) : the trades of one ticker on one day — of one stat or of two (#507)
 * — in the day's order. [maxSize] is the largest of the trades, never a sum or a net between a
 * short and a long ; [openPrice], [exitPrice] and [retainedGainPercent] are only set on a
 * single-trade row ; [durationMinutes] adds the trades' durations up (« durée cumulée »).
 */
export interface JournalDay {
  tradeDate: Date;
  ticker: string;
  patterns: Pattern[];
  directions: TradeDirection[];
  tradeCount: number;
  maxSize: number | null;
  openPrice: number | null;
  exitPrice: number | null;
  retainedGainPercent: number | null;
  durationMinutes: number | null;
  retainedProfitDollars: number | null;
  trades: TradeEntry[];
}

/**
 * KPIs of the journal listing, computed by the backend over the **whole filtered set** (not the
 * current page). Every figure is built on the retained P&L, and open positions count in none of
 * them. Nullable fields have no meaning yet : no closed trade, no winner, no loser (and with no
 * loser the profit factor is undefined rather than infinite).
 */
export interface JournalSummary {
  tradeCount: number;
  retainedPnl: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  profitFactor: number | null;
  /**
   * Closed trades taken on a stat the recorded prices say was not the setup (#499), and their P&L
   * beside the others' — a discipline number : together they make [retainedPnl].
   */
  outOfPatternCount: number;
  outOfPatternPnl: number;
  inRulesPnl: number;
}

/**
 * Input shape — what the trade page hands to the repository on update. Carries the identity,
 * `direction` + `executions` and the real P&L ; the computed aggregates are **not** sent (the
 * backend derives them), and the backend ignores `statEntryId` — no update links or unlinks a stat.
 * Dates stay as native `Date` — the adapter serialises to wire format.
 */
export interface TradeEntryInput {
  statEntryId: string | null;
  tradeDate: Date;
  ticker: string;
  pattern: Pattern | null;
  direction: TradeDirection | null;
  executions: TradeExecutionInput[];
  realProfitDollars: number | null;
  note: string | null;
  errorNote: string | null;
}

/** A trade created on its own from the journal (#634) — never linked to a stat, no fill yet. */
export interface NewTradeInput {
  tradeDate: Date;
  ticker: string;
  pattern: Pattern;
  direction: TradeDirection;
}
