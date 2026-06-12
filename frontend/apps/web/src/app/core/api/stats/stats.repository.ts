import { Observable } from 'rxjs';
import {
  PageRequest,
  PagedResult,
  RadarStatInput,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
} from './stat-entry.model';

/**
 * Port — trade-stats read + ingestion + export + per-user CRUD. Since V2 the dataset is
 * **admin-global + per-user** : any authenticated user reads the global rows + their own ([findAll],
 * filtered). It is fed by an **admin CSV import** ([importCsv], ADMIN-gated, community rows) and by
 * the user's own radar / manual analyses ([createFromRadar] / [create]). A user may [update] /
 * [delete] only their **own** rows (the server enforces ownership ; IMPORT rows → 404). The CSV
 * export ([exportCsv]) covers the community set only. Aggregates / charts land in phase 2.
 *
 * The default adapter (`HttpStatsRepository` in `adapters/stats.http.ts`) owns the wire formats
 * (ISO dates, Spring `Page`, multipart, blob) ; consumers only ever see the domain shapes.
 */
export abstract class StatsRepository {
  /**
   * Filtered + paginated listing scoped to what the current user may see (the global rows + their
   * own). When `page` is omitted the adapter falls back to the backend's `@PageableDefault`.
   */
  abstract findAll(
    filter?: StatEntryFilter,
    page?: PageRequest,
  ): Observable<PagedResult<StatEntry>>;

  /**
   * Seeds a stats row from a radar pick (the « Add stat » button) — `source = RADAR`. Open to any
   * authenticated user ; the row is owned by its creator. Upserts on (day, ticker, owner).
   */
  abstract createFromRadar(input: RadarStatInput): Observable<StatEntry>;

  /** Creates a manual stats row (`source = MANUAL`) from the « Add » dialog. Upserts on day/ticker. */
  abstract create(input: StatEntryInput): Observable<StatEntry>;

  /** Edits one of the caller's own rows. Not-owned (incl. IMPORT) → 404 ; day/ticker collision → 409. */
  abstract update(id: string, input: StatEntryInput): Observable<StatEntry>;

  /** Deletes one of the caller's own rows. Not-owned (incl. IMPORT) → 404. */
  abstract delete(id: string): Observable<void>;

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
