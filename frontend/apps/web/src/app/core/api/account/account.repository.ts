import { Observable } from 'rxjs';
import {
  AccountMovement,
  AccountMovementInput,
  AccountSummary,
  BalancePoint,
  CorrectionInput,
} from './account.model';

/**
 * Port — broker cash account. Speaks the **domain** language only (native `Date`, signed
 * amounts) ; the default adapter (`HttpAccountRepository`) owns the HTTP wire format.
 *
 * Tests can inject a stub via `useClass` / `useValue` without touching HTTP.
 */
export abstract class AccountRepository {
  /** Paginated movement history, newest-first. Omit `page` to get the backend default (25). */
  abstract findMovements(page?: PageRequest): Observable<PagedResult<AccountMovement>>;
  /** Current balance + breakdown by movement type. */
  abstract getSummary(): Observable<AccountSummary>;
  /** Cumulative end-of-day balance series (ascending) for the evolution chart. */
  abstract getBalanceSeries(): Observable<BalancePoint[]>;
  /** Adds a DEPOSIT or WITHDRAWAL (positive magnitude ; the backend applies the sign). */
  abstract addMovement(input: AccountMovementInput): Observable<AccountMovement>;
  /** Records a balance correction (target → signed ADJUSTMENT delta). */
  abstract correctBalance(input: CorrectionInput): Observable<AccountMovement>;
  /** Edits a manual movement. */
  abstract updateMovement(id: string, input: AccountMovementInput): Observable<AccountMovement>;
  /** Deletes a manual movement (TRADE rows are managed from the journal). */
  abstract deleteMovement(id: string): Observable<void>;
}

export interface PageRequest {
  pageIndex: number;
  pageSize: number;
}

/** Subset of Spring's `Page<T>` shape the UI cares about. */
export interface PagedResult<T> {
  content: T[];
  pageIndex: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}
