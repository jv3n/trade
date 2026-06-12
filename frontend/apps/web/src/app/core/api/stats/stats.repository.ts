import { Observable } from 'rxjs';
import { PageRequest, PagedResult, RadarStatInput, StatEntry } from './stat-entry.model';

/**
 * Port — trade-stats read + ingestion + export + radar create. Since V2 the dataset is
 * **admin-global + per-user** : any authenticated user reads the global rows + their own ([findAll]).
 * It is fed by an **admin CSV import** ([importCsv], ADMIN-gated) for the global curated rows, and by
 * a per-user radar « Add stat » pick ([createFromRadar], open to any authenticated user). The CSV
 * export ([exportCsv]) covers the curated global set only. Aggregates / charts land in phase 2.
 *
 * The default adapter (`HttpStatsRepository` in `adapters/stats.http.ts`) owns the wire formats
 * (ISO dates, Spring `Page`, multipart, blob) ; consumers only ever see the domain shapes.
 */
export abstract class StatsRepository {
  /**
   * Paginated listing scoped to what the current user may see (the global rows + their own radar
   * picks). When `page` is omitted the adapter falls back to the backend's `@PageableDefault`
   * (page 0, size 50, sort `tradeDate desc`).
   */
  abstract findAll(page?: PageRequest): Observable<PagedResult<StatEntry>>;

  /**
   * Seeds a partial stats row from a radar pick (the « Add stat » button). Open to any authenticated
   * user ; the row is owned by and visible only to its creator. Resolves to the created row.
   */
  abstract createFromRadar(input: RadarStatInput): Observable<StatEntry>;

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
