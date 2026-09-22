import { Observable } from 'rxjs';
import { TradeEntry } from '../journal/trade-entry.model';
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
 * A stat is created by promoting a candidate (#189, on the candidates side) or typed by hand for a
 * past day ([create], #326). No import : the CSV leg is export only.
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

  /**
   * Single stat by id. The trade page reads it to show the day context (premarket + session) its
   * trade was born from, read-only. Foreign id / unknown id → 404.
   */
  abstract findById(id: string): Observable<StatEntry>;

  /** KPIs over the same filter as the listing, computed on the whole filtered set. */
  abstract summary(filter?: StatEntryFilter): Observable<StatSummary>;

  /**
   * Creates a stat typed by hand (#326) — premarket, session and flags in one go, for any day up to
   * today. A future day → 400 ; (day, ticker) already taken → 409.
   */
  abstract create(input: StatEntryInput): Observable<StatEntry>;

  /**
   * Overwrites a stat — what the session panel saves each time a field is left (premarket recap +
   * session prices + flags). Foreign id → 404 ; (day, ticker) already taken → 409 ; clearing a
   * price of a completed stat → 400.
   */
  abstract update(id: string, input: StatEntryInput): Observable<StatEntry>;

  /**
   * Ticks the stat as completed, or back to "to complete" (#263). Ticking without the five session
   * prices → 400.
   */
  abstract setCompleted(id: string, completed: boolean): Observable<StatEntry>;

  abstract delete(id: string): Observable<void>;

  /**
   * « → Trade » (#193) — creates the journal trade this stat gave birth to and returns it, so the
   * caller can navigate straight to its page. The trade inherits the stat's date, ticker and
   * pattern. One trade per stat : a stat that already has one answers 409, and its row shows a link
   * instead of the action.
   */
  abstract promoteToTrade(id: string): Observable<TradeEntry>;

  /**
   * Downloads the caller's stats as a CSV blob (UTF-8 with BOM, RFC 4180). Same layout as the
   * import, so the file is roundtrip-safe : it re-imports as-is, including stats still to complete.
   */
  abstract exportCsv(): Observable<Blob>;
}
