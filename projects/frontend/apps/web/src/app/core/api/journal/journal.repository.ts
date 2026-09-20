import { Observable } from 'rxjs';
import { JournalSummary, TradeEntry, TradeEntryFilter, TradeEntryInput } from './trade-entry.model';

/**
 * Port — CRUD over the trading journal. The port speaks the **domain** language only :
 * [TradeEntry] / [TradeEntryInput] / [TradeEntryFilter] with native `Date` types. The default
 * adapter (`HttpJournalRepository` in `adapters/journal.http.ts`) is responsible for
 * translating to / from the HTTP wire format (ISO strings, repeated query params, etc.).
 *
 * Tests can inject a stub via `useClass` or `useValue` ; nothing in this file leaks the
 * presence of HTTP, ISO strings, or backend DTOs.
 */
export abstract class JournalRepository {
  /**
   * Paginated listing. When `page` is omitted the adapter falls back to Spring's
   * `@PageableDefault` (page 0, size 50, sort tradeDate desc), so callers that don't care
   * about pagination still get the first 50 freshest trades.
   */
  abstract findAll(
    filter?: TradeEntryFilter,
    page?: PageRequest,
  ): Observable<PagedResult<TradeEntry>>;
  abstract findById(id: string): Observable<TradeEntry>;

  /**
   * KPIs over the same filter as [findAll] — P&L, win rate, average win / loss, profit factor.
   * Computed on the whole filtered set, so they don't follow the pagination (#195).
   */
  abstract summary(filter?: TradeEntryFilter): Observable<JournalSummary>;

  /**
   * No `create` on purpose (#193) : a trade is born from a stat, through
   * `StatsRepository.promoteToTrade`. The backend has no create endpoint either.
   */
  abstract update(id: string, input: TradeEntryInput): Observable<TradeEntry>;
  abstract delete(id: string): Observable<void>;
  /**
   * Downloads every trade as a CSV blob (UTF-8 with BOM, RFC 4180). Export only (#196) : there is
   * no import leg — a trade is born from a stat and its executions are typed on its page.
   */
  abstract exportCsv(): Observable<Blob>;

  /**
   * Attaches (or replaces) the trade's single screenshot. Returns the refreshed trade so the caller
   * picks up `hasScreenshot`. Type / size are validated server-side (→ 400 on violation).
   */
  abstract uploadScreenshot(id: string, file: File): Observable<TradeEntry>;
  /** Streams the trade's screenshot as an image blob (for an object-URL preview). 404 if none. */
  abstract getScreenshotBlob(id: string): Observable<Blob>;
  /** Removes the trade's screenshot. Returns the refreshed trade (`hasScreenshot = false`). */
  abstract deleteScreenshot(id: string): Observable<TradeEntry>;
}

/**
 * Page coordinates the adapter forwards to the backend. `sortField` / `sortDirection` are
 * optional ; omit them to inherit Spring's default sort (`tradeDate desc, createdAt desc`).
 */
export interface PageRequest {
  pageIndex: number;
  pageSize: number;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

/** Subset of Spring's `Page<T>` shape that the UI cares about. */
export interface PagedResult<T> {
  content: T[];
  pageIndex: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}
