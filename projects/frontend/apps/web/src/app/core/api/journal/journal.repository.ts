import { Observable } from 'rxjs';
import {
  JournalDay,
  JournalSummary,
  NewTradeInput,
  TradeEntry,
  TradeEntryFilter,
  TradeEntryInput,
} from './trade-entry.model';

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
   * The journal's rows (#500) — one per ticker and day, the same filter as [findAll], paged and
   * sorted as rows : a page of ten is ten ticker-days, whatever the trades they hold.
   */
  abstract findDays(
    filter?: TradeEntryFilter,
    page?: PageRequest,
  ): Observable<PagedResult<JournalDay>>;

  /**
   * KPIs over the same filter as [findAll] — P&L, win rate, average win / loss, profit factor.
   * Computed on the whole filtered set, so they don't follow the pagination (#195).
   */
  abstract summary(filter?: TradeEntryFilter): Observable<JournalSummary>;

  /**
   * A trade on its own (#634), never linked to a stat. A trade studied first is born from its stat,
   * through `StatsRepository.promoteToTrade`.
   */
  abstract create(input: NewTradeInput): Observable<TradeEntry>;
  abstract update(id: string, input: TradeEntryInput): Observable<TradeEntry>;
  abstract delete(id: string): Observable<void>;
  /**
   * Downloads every trade as a CSV blob (UTF-8 with BOM, RFC 4180). Export only (#196) : there is
   * no import leg — a trade is typed, from its stat or on its own, and its executions on its page.
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
