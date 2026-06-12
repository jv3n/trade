import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import {
  PageRequest,
  PagedResult,
  RadarStatInput,
  StatEntry,
  StatSource,
} from '../stat-entry.model';
import { ImportResult, StatsRepository } from '../stats.repository';

// ---------------------------------------------------------------------------
// Wire DTO — the shape Spring Boot serialises on `GET /api/stats`. Kept private : consumers only
// ever see the domain [StatEntry]. The only difference is date serialisation : Spring emits
// `LocalDate` as `YYYY-MM-DD` and `Instant` as ISO-8601 with `Z`.
// ---------------------------------------------------------------------------

interface StatEntryWireDto {
  id: string;
  tradeDate: string;
  ticker: string;
  gapUpPercent: number;
  openPrice: number;
  floatSharesMillions: number | null;
  institutionsPercent: number | null;
  instOver20: boolean | null;
  under1Dollar: boolean | null;
  ssr: boolean | null;
  entryAfter11am: boolean | null;
  note: string | null;
  highPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  pushPercent: number | null;
  lodPercent: number | null;
  eodPercent: number | null;
  source: StatSource;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// `parseISO('2026-06-04')` → midnight LOCAL (no UTC shift) ; `parseISO('…Z')` → instant. Same
// convention as the journal adapter.
function fromWire(w: StatEntryWireDto): StatEntry {
  return {
    id: w.id,
    tradeDate: parseISO(w.tradeDate),
    ticker: w.ticker,
    gapUpPercent: w.gapUpPercent,
    openPrice: w.openPrice,
    floatSharesMillions: w.floatSharesMillions,
    institutionsPercent: w.institutionsPercent,
    instOver20: w.instOver20,
    under1Dollar: w.under1Dollar,
    ssr: w.ssr,
    entryAfter11am: w.entryAfter11am,
    note: w.note,
    highPrice: w.highPrice,
    lodPrice: w.lodPrice,
    eodPrice: w.eodPrice,
    pushPercent: w.pushPercent,
    lodPercent: w.lodPercent,
    eodPercent: w.eodPercent,
    source: w.source,
    createdBy: w.createdBy,
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

// Spring's `Page<T>` JSON shape — only the fields the UI uses. Spring serialises the page index as
// `number` ; the domain type renames it `pageIndex` so consumers don't grep the wrong field.
interface SpringPageWireDto<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

function fromPageWire(p: SpringPageWireDto<StatEntryWireDto>): PagedResult<StatEntry> {
  return {
    content: p.content.map(fromWire),
    pageIndex: p.number,
    pageSize: p.size,
    totalElements: p.totalElements,
    totalPages: p.totalPages,
  };
}

/**
 * Default adapter for [StatsRepository]. [findAll] reads the paginated `Page<StatEntry>` from
 * `GET /api/stats`. [importCsv] posts the picked file as `multipart/form-data` to
 * `POST /api/stats/import` — the server always returns 200 with an [ImportResult] (per-row errors
 * are in the body, not a 4xx), so the consumer can render diagnostics inline. [exportCsv] streams
 * `GET /api/stats/export` as a binary `Blob` for the download trick.
 */
@Injectable()
export class HttpStatsRepository extends StatsRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/stats';

  findAll(page?: PageRequest): Observable<PagedResult<StatEntry>> {
    let params = new HttpParams();
    if (page) {
      params = params.set('page', page.pageIndex).set('size', page.pageSize);
      if (page.sortField && page.sortDirection) {
        // `createdAt,desc` is appended as a tie-breaker so sorting on a low-cardinality column
        // stays deterministic across paginated requests (same rationale as the journal adapter).
        params = params
          .append('sort', `${page.sortField},${page.sortDirection}`)
          .append('sort', 'createdAt,desc');
      }
    }
    return this.http
      .get<SpringPageWireDto<StatEntryWireDto>>(this.base, { params })
      .pipe(map((p) => fromPageWire(p)));
  }

  importCsv(file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResult>(`${this.base}/import`, form);
  }

  createFromRadar(input: RadarStatInput): Observable<StatEntry> {
    return this.http.post<StatEntryWireDto>(this.base, input).pipe(map((w) => fromWire(w)));
  }

  /**
   * Streams the export endpoint as a binary `Blob` so the consumer can hand it to a download trick
   * (`URL.createObjectURL` + anchor click). The server sets the `Content-Disposition` filename.
   */
  exportCsv(): Observable<Blob> {
    return this.http.get(`${this.base}/export`, {
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    });
  }
}
