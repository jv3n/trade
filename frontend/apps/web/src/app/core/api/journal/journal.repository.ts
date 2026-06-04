import { Observable } from 'rxjs';
import { TradeEntry, TradeEntryFilter, TradeEntryInput } from './trade-entry.model';

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
  abstract create(input: TradeEntryInput): Observable<TradeEntry>;
  abstract update(id: string, input: TradeEntryInput): Observable<TradeEntry>;
  abstract delete(id: string): Observable<void>;
  /** Downloads every trade as a CSV blob (UTF-8 with BOM, RFC 4180). */
  abstract exportCsv(): Observable<Blob>;
  /**
   * Imports a CSV file produced by [exportCsv] (or hand-edited from a previous export).
   * Atomic batch — partial success is impossible : either the whole file is persisted
   * (`created == parsed`, `errors` empty) or no row is (`created == 0`, per-row diagnostics
   * in `errors`).
   */
  abstract importCsv(file: File): Observable<ImportResult>;
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

/** Outcome of [JournalRepository.importCsv]. Aligned 1:1 with the backend DTO. */
export interface ImportResult {
  parsed: number;
  created: number;
  errors: ImportError[];
}

/** Per-row diagnostic emitted by the CSV decoder. */
export interface ImportError {
  line: number;
  message: string;
}
