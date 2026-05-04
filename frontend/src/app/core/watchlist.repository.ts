import { Observable } from 'rxjs';

export interface WatchlistEntry {
  id: string;
  symbol: string;
  addedAt: string;
}

/**
 * Port — read/write access to the user's watchlist (tickers tracked without being held in
 * Wealthsimple). Backed by the backend `watchlist/` module.
 *
 * Add is idempotent server-side : posting a symbol that's already on the list returns the
 * existing entry. Remove is **not** idempotent : a 404 surfaces when the symbol wasn't on the
 * list, so the optimistic UI can detect drift between local state and server state.
 */
export abstract class WatchlistRepository {
  abstract list(): Observable<WatchlistEntry[]>;
  abstract add(symbol: string): Observable<WatchlistEntry>;
  abstract remove(symbol: string): Observable<void>;
}
