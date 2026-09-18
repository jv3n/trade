/**
 * Trading-journal **domain** types — consumed by feature components and by the repository
 * port. The wire-format (ISO date strings, ISO instant strings) is **not** exposed here ; the
 * HTTP adapter in `adapters/journal.http.ts` owns the mapping between wire and domain.
 *
 * The four string-literal types match the Postgres ENUMs and the Kotlin enums on the backend
 * — they're the shared vocabulary that crosses the wire unchanged.
 */

export type TradePlay = 'A' | 'B';
export type TradePattern = 'GUS' | 'FRD';
export type TradeOpenSide = 'FRONT' | 'BACK';
export type TradeExitStrategy = 'SWING_20' | 'EOD';

/** Position direction — matches the backend `trade_direction` enum (issue #93). */
export type TradeDirection = 'BUY' | 'SHORT';
/** Whether an execution opens/adds (`ENTRY`) or closes/reduces (`EXIT`) the position. */
export type ExecutionKind = 'ENTRY' | 'EXIT';
/** Position fill state derived from the executions — see `position-aggregates.ts`. */
export type PositionStatus = 'OPEN' | 'PARTIAL' | 'CLOSED';

/** Derived state for filtering — see backend `TradeStatus` enum. */
export type TradeStatus = 'OPEN' | 'CLOSED' | 'PROFITABLE' | 'LOSING';

export const TRADE_PLAYS: readonly TradePlay[] = ['A', 'B'];
export const TRADE_PATTERNS: readonly TradePattern[] = ['GUS', 'FRD'];
export const TRADE_OPEN_SIDES: readonly TradeOpenSide[] = ['FRONT', 'BACK'];
export const TRADE_EXIT_STRATEGIES: readonly TradeExitStrategy[] = ['SWING_20', 'EOD'];
export const TRADE_STATUSES: readonly TradeStatus[] = ['OPEN', 'CLOSED', 'PROFITABLE', 'LOSING'];
export const TRADE_DIRECTIONS: readonly TradeDirection[] = ['SHORT', 'BUY'];
export const EXECUTION_KINDS: readonly ExecutionKind[] = ['ENTRY', 'EXIT'];

/**
 * One execution leg of a position : a single fill with its own share count and price. Ordered by
 * `seq` (0-based) within the parent trade. The `seq` is server-assigned ; on input the order of the
 * array is what matters (the backend re-sequences it).
 */
export interface TradeExecution {
  seq: number;
  kind: ExecutionKind;
  shares: number;
  price: number;
}

/** Same as [TradeExecution] minus the server-assigned `seq` — what forms hand to the repository. */
export interface TradeExecutionInput {
  kind: ExecutionKind;
  shares: number;
  price: number;
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
  plays?: TradePlay[] | null;
  patterns?: TradePattern[] | null;
  status?: TradeStatus | null;
}

/**
 * One trade (a *position*) in the journal. Dates / instants are native `Date` — adapters parse from
 * wire.
 *
 * Since the multi-execution model (issue #93) the position is built from `direction` + `executions`.
 * The flat `size` / `openPrice` / `exitPrice` / `profitDollars` / `gainPercent` are **derived
 * aggregates** (read-only — recomputed server-side from the executions) ; they stay on the type
 * because the listing table sorts/filters on them. `statEntryId` links to an imported stat row ;
 * `null` = an "orphan" trade with no stat attached.
 */
export interface TradeEntry {
  id: string;
  tradeDate: Date;
  ticker: string;
  direction: TradeDirection | null;
  executions: TradeExecution[];
  play: TradePlay | null;
  pattern: TradePattern | null;
  size: number | null;
  openPrice: number | null;
  exitPrice: number | null;
  profitDollars: number | null;
  gainPercent: number | null;
  note: string | null;
  pre935To10h: boolean | null;
  preGapUp50: boolean | null;
  prePrice1To10: boolean | null;
  preFloat3To50m: boolean | null;
  preWaitPush: boolean | null;
  openSide: TradeOpenSide | null;
  shortOnResistance: boolean | null;
  exitStrategy: TradeExitStrategy | null;
  errorNote: string | null;
  statEntryId: string | null;
  /** Whether a screenshot is attached (issue #110). The bytes are served on a dedicated endpoint. */
  hasScreenshot: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input shape — what callers (forms, business code) hand to the repository for create / update.
 * Carries `direction` + `executions` ; the flat aggregates are **not** sent (the backend derives
 * them). Dates stay as native `Date` — the adapter serialises to wire format.
 */
export interface TradeEntryInput {
  tradeDate: Date;
  ticker: string;
  direction: TradeDirection | null;
  executions: TradeExecutionInput[];
  play: TradePlay | null;
  pattern: TradePattern | null;
  note: string | null;
  pre935To10h: boolean | null;
  preGapUp50: boolean | null;
  prePrice1To10: boolean | null;
  preFloat3To50m: boolean | null;
  preWaitPush: boolean | null;
  openSide: TradeOpenSide | null;
  shortOnResistance: boolean | null;
  exitStrategy: TradeExitStrategy | null;
  errorNote: string | null;
  statEntryId: string | null;
}
