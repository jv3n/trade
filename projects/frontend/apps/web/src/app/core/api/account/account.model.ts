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
  /** Non-null only for TRADE movements — the linked journal trade (row is read-only). */
  tradeEntryId: string | null;
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

/** Balance-correction payload — the real broker balance ; the backend records the signed delta. */
export interface CorrectionInput {
  targetBalance: number;
  valueDate: Date;
  note: string | null;
}

/** One point of the cumulative balance series — end-of-day balance on [date]. */
export interface BalancePoint {
  date: Date;
  balance: number;
}

/** Aggregates for the summary panel — all in the account's single currency (USD v1). */
export interface AccountSummary {
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  netInjected: number;
  tradesPnl: number;
  adjustments: number;
  movementCount: number;
}
