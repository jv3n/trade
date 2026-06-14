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

/** Derived state for filtering — see backend `TradeStatus` enum. */
export type TradeStatus = 'OPEN' | 'CLOSED' | 'PROFITABLE' | 'LOSING';

export const TRADE_PLAYS: readonly TradePlay[] = ['A', 'B'];
export const TRADE_PATTERNS: readonly TradePattern[] = ['GUS', 'FRD'];
export const TRADE_OPEN_SIDES: readonly TradeOpenSide[] = ['FRONT', 'BACK'];
export const TRADE_EXIT_STRATEGIES: readonly TradeExitStrategy[] = ['SWING_20', 'EOD'];
export const TRADE_STATUSES: readonly TradeStatus[] = ['OPEN', 'CLOSED', 'PROFITABLE', 'LOSING'];

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
 * One trade in the journal. Dates / instants are native `Date` — adapters parse from wire.
 *
 * Only `tradeDate` + `ticker` are mandatory ; `play` / `pattern` / `size` / `openPrice` are
 * nullable (backend V4) so a trade can be jotted down fast and completed later. `statEntryId`
 * links to an imported stat row ; `null` = an "orphan" trade with no stat attached.
 */
export interface TradeEntry {
  id: string;
  tradeDate: Date;
  ticker: string;
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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input shape — what callers (forms, business code) hand to the repository for create /
 * update. Same fields as [TradeEntry] minus `id` / `createdAt` / `updatedAt` (server-side).
 * Dates stay as native `Date` — the adapter is responsible for serialising to wire format.
 */
export interface TradeEntryInput {
  tradeDate: Date;
  ticker: string;
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
}
