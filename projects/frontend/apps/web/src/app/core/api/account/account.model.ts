import { TradeDirection } from '../journal/trade-entry.model';

/**
 * Broker cash-account **domain** types — consumed by the account feature and the repository port.
 * The wire format (ISO date strings) is owned by the HTTP adapter ; consumers stay in `Date` land.
 *
 * [amount] is the **signed** effect on the balance : deposits +, withdrawals −, trade P&L and
 * adjustments ±. `balance = Σ amount`.
 */

export type AccountMovementType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE' | 'ADJUSTMENT';

/** Types the user can create/edit by hand. TRADE comes from the journal, ADJUSTMENT from a correction. */
export const MANUAL_MOVEMENT_TYPES: readonly AccountMovementType[] = ['DEPOSIT', 'WITHDRAWAL'];

export interface AccountMovement {
  id: string;
  type: AccountMovementType;
  /** Signed effect on the balance. */
  amount: number;
  valueDate: Date;
  note: string | null;
  /**
   * Balance of the account **after** this movement, always computed by the backend over the whole
   * ordered history — never over the filtered page, so narrowing to trades does not renumber it.
   */
  balanceAfter: number;
  /** Non-null only for TRADE movements — the linked journal trade (row is read-only). */
  tradeEntryId: string | null;
  /**
   * Direction and size of the linked trade, completing its label (« KTTA short 350 »). Structured
   * rather than pre-formatted : the direction word is translated here. Null on manual movements.
   */
  tradeDirection: TradeDirection | null;
  tradeSize: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create / edit payload for a manual movement. [amount] is a **positive magnitude** for
 * DEPOSIT / WITHDRAWAL — the backend applies the sign from [type].
 */
export interface AccountMovementInput {
  type: AccountMovementType;
  amount: number;
  valueDate: Date;
  note: string | null;
}

/** One point of the cumulative balance series — end-of-day balance on [date]. */
export interface BalancePoint {
  date: Date;
  balance: number;
}

/**
 * Figures behind the KPI row — all in the account's single currency (USD v1).
 *
 * [balance] is the **current** account balance, never windowed : it is what the broker shows this
 * morning. Every `period*` figure is scoped to the active filter, so the KPI row and the movements
 * table always describe the same window.
 */
export interface AccountSummary {
  balance: number;
  periodPnl: number;
  periodTradeCount: number;
  periodWinningTradeCount: number;
  periodDeposits: number;
  periodWithdrawals: number;
  periodNetInjected: number;
  periodAdjustments: number;
  periodMovementCount: number;
}

/**
 * Movement filter. Mirrors the journal's : the period presets resolve to a `dateFrom` / `dateTo`
 * pair here, and only dates travel to the backend — preset names stay a UI concern.
 */
export interface AccountMovementFilter {
  dateFrom: Date | null;
  dateTo: Date | null;
  types: readonly AccountMovementType[] | null;
}

/**
 * One morning's reconciliation between the app balance and the one TradeZero displays (#198).
 * [gap] is `brokerBalance − appBalance` as it was that morning : zero on a clean one, and then
 * [correctionId] is null. Both travel together so the history line can read « 18/09 ✓ » or
 * « 12/09 −12,40 » without inferring one from the other.
 */
export interface Reconciliation {
  id: string;
  valueDate: Date;
  brokerBalance: number;
  appBalance: number;
  gap: number;
  correctionId: string | null;
  reconciledAt: Date;
}

/** What the morning block sends : the balance read on TradeZero, and the day it settles. */
export interface ReconciliationInput {
  brokerBalance: number;
  valueDate: Date;
}
