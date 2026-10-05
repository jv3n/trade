import { Observable } from 'rxjs';
import { Locate, LocateInput, LocateUpdate } from './locates.model';

/**
 * Port — locates. Speaks the **domain** language only (native `Date`) ; the default adapter
 * (`HttpLocatesRepository`) owns the HTTP wire format. Every change moves the account : each locate
 * is its own `LOCATE` line there.
 */
export abstract class LocatesRepository {
  /** A day's locates, oldest first — narrowed to [ticker] when given. */
  abstract listForDate(date: Date, ticker?: string): Observable<Locate[]>;
  abstract listForCandidate(candidateId: string): Observable<Locate[]>;
  abstract create(input: LocateInput): Observable<Locate>;
  abstract update(id: string, update: LocateUpdate): Observable<Locate>;
  /** Fixing a typo : a locate is never cancelled, its line leaves the account with it. */
  abstract delete(id: string): Observable<void>;
}
