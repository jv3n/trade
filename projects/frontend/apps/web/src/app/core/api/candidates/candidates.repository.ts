import { Observable } from 'rxjs';
import { Candidate, CandidateInput } from './candidates.model';

/**
 * Port — candidates (morning capture). Speaks the **domain** language only (native `Date`) ; the
 * default adapter (`HttpCandidatesRepository`) owns the HTTP wire format.
 *
 * Tests can inject a stub via `useClass` / `useValue` without touching HTTP.
 */
export abstract class CandidatesRepository {
  /** A day's candidates. */
  abstract listForDate(date: Date): Observable<Candidate[]>;
  /** Captures a new candidate — errors with HTTP 409 when the ticker is already captured that day. */
  abstract create(input: CandidateInput): Observable<Candidate>;
  /** Updates a candidate — 409 when renamed onto a ticker already captured that day. */
  abstract update(id: string, input: CandidateInput): Observable<Candidate>;
  abstract delete(id: string): Observable<void>;
}
