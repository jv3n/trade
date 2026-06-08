import { Observable } from 'rxjs';

/**
 * Port — trade-stats ingestion + export. The stats dataset is fed by an **admin CSV import**
 * (produced by `scripts/stats`, decoded server-side by `StatEntryCsvDecoder`) and read back as a
 * whole-table CSV ([exportCsv]). The listing / aggregates land in phase 2.
 *
 * The default adapter (`HttpStatsRepository` in `adapters/stats.http.ts`) owns the multipart +
 * blob wire formats ; consumers only ever see the [ImportResult] / `Blob` shapes.
 */
export abstract class StatsRepository {
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
