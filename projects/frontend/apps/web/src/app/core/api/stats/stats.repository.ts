import { Observable } from 'rxjs';
import {
  PageRequest,
  PagedResult,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatSummary,
} from './stat-entry.model';

/**
 * Port — the stats sheet : listing, KPIs, completion, delete and the CSV export. Every stat belongs
 * to the current user ; a foreign id answers 404.
 *
 * A stat is **created by promoting a candidate** (#189) — there is no create method here on
 * purpose, and no import : the CSV leg is export only.
 *
 * The default adapter (`HttpStatsRepository` in `adapters/stats.http.ts`) owns the wire formats
 * (ISO dates, Spring `Page`, multipart, blob) ; consumers only ever see the domain shapes.
 */
export abstract class StatsRepository {
  /**
   * Filtered + paginated listing, scoped to the caller. When `page` is omitted the adapter falls
   * back to the backend's `@PageableDefault`.
   */
  abstract findAll(
    filter?: StatEntryFilter,
    page?: PageRequest,
  ): Observable<PagedResult<StatEntry>>;

  /** KPIs over the same filter as the listing, computed on the whole filtered set. */
  abstract summary(filter?: StatEntryFilter): Observable<StatSummary>;

  /**
   * Overwrites a stat — what the completion panel saves (premarket recap + session prices + flags).
   * Foreign id → 404 ; (day, ticker) already taken → 409.
   */
  abstract update(id: string, input: StatEntryInput): Observable<StatEntry>;

  abstract delete(id: string): Observable<void>;

  /**
   * Downloads the caller's stats as a CSV blob (UTF-8 with BOM, RFC 4180). Same layout as the
   * import, so the file is roundtrip-safe : it re-imports as-is, including stats still to complete.
   */
  abstract exportCsv(): Observable<Blob>;
}
