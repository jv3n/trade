import { Observable } from 'rxjs';
import { Pattern } from '../shared/pattern.model';
import { BulkPromotion, Candidate, CandidateInput } from './candidates.model';

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

  /**
   * Copies a candidate onto the stats sheet in [pattern] — the « → GUS » / « → DT » actions. The
   * new stat starts "to complete". Errors with HTTP 409 when that candidate (or its day + ticker)
   * already has a stat in that pattern.
   *
   * The created stat is not surfaced : the page reloads the day, and the stats sheet is where it is
   * read. Keeping it out of the port keeps candidates independent from the stats wire shape.
   */
  abstract promote(id: string, pattern: Pattern): Observable<void>;

  /** Promotes to GUS every candidate of the day without any stat yet — never a DT. Idempotent. */
  abstract promoteDay(date: Date): Observable<BulkPromotion>;
}
