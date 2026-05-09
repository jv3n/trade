import { Observable } from 'rxjs';

export interface WatchlistEntry {
  id: string;
  symbol: string;
  addedAt: string;
  /**
   * Snapshotted at POST-add time by the backend (V7, 2026-05-09). `null` when the lookup failed
   * (rate-limit, transient unreachable) or for entries pre-existing the migration. The dashboard
   * renders no chip on null (degrade closed) — replaces the previous lazy-lookup design that
   * burst-banned Twelve Data on a watchlist of 5+ entries with a cold cache.
   */
  instrumentType: 'STOCK' | 'ETF' | 'INDEX' | 'OTHER' | null;
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
