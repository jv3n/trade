import { Observable } from 'rxjs';
import { Candidate, CandidateInput } from './candidates.model';

/**
 * Port — candidates (short-trade preparation cockpit). Speaks the **domain** language only (native
 * `Date`) ; the default adapter (`HttpCandidatesRepository`) owns the HTTP wire format.
 *
 * Tests can inject a stub via `useClass` / `useValue` without touching HTTP.
 */
export abstract class CandidatesRepository {
  /** The session's candidates for the dropdown (date-driven lifecycle — older ones are hidden). */
  abstract listForDate(date: Date): Observable<Candidate[]>;
  /** Fetch a single candidate by id. */
  abstract get(id: string): Observable<Candidate>;
  /** Saves a new candidate. */
  abstract create(input: CandidateInput): Observable<Candidate>;
  /** Re-saves (upserts) an existing candidate. */
  abstract update(id: string, input: CandidateInput): Observable<Candidate>;
  /** Removes a candidate. */
  abstract delete(id: string): Observable<void>;
}
