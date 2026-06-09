import { Observable } from 'rxjs';
import { PageRequest, PagedResult, StatEntry } from './stat-entry.model';

/**
 * Port — trade-stats read + ingestion + export. The stats dataset is a **global, shared** table :
 * any authenticated user reads it ([findAll]), but it is fed only by an **admin CSV import**
 * (produced by `scripts/stats`, decoded server-side by `StatEntryCsvDecoder`) and can be read back
 * as a whole-table CSV ([exportCsv]). Aggregates / charts land in phase 2.
 *
 * The default adapter (`HttpStatsRepository` in `adapters/stats.http.ts`) owns the wire formats
 * (ISO dates, Spring `Page`, multipart, blob) ; consumers only ever see the domain shapes.
 */
export abstract class StatsRepository {
  /**
   * Paginated listing of the whole stats dataset. When `page` is omitted the adapter falls back to
   * the backend's `@PageableDefault` (page 0, size 50, sort `tradeDate desc`).
   */
  abstract findAll(page?: PageRequest): Observable<PagedResult<StatEntry>>;

  /**
   * Imports a stats CSV. Atomic batch — partial success is impossible : either the whole file is
   * persisted (`created == parsed`, `errors` empty) or no row is (`created == 0`, per-row
   * diagnostics in `errors`).
   */
  abstract importCsv(file: File): Observable<ImportResult>;

  /**
   * Downloads the whole stats table as a CSV blob (UTF-8 with BOM, RFC 4180). Layout is identical to
   * the import (the 14 columns, computed `%push` / `%LOD` / `%EOD` omitted) — so the file is
   * roundtrip-safe : it re-imports as-is.
   */
  abstract exportCsv(): Observable<Blob>;
}

/** Outcome of [StatsRepository.importCsv]. Aligned 1:1 with the backend DTO. */
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
