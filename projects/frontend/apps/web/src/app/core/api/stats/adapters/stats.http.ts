import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import {
  PageRequest,
  PagedResult,
  RadarStatInput,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatSource,
} from '../stat-entry.model';
import { ImportResult, StatsRepository } from '../stats.repository';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/stats`. Kept private : consumers only ever
// see the domain [StatEntry] / [StatEntryInput]. Spring emits `LocalDate` as `YYYY-MM-DD` and
// `Instant` as ISO-8601 with `Z` ; the form request sends `LocalDate` strings back the same way.
// ---------------------------------------------------------------------------

interface StatEntryWireDto {
  id: string;
  tradeDate: string;
  ticker: string;
  gapUpPercent: number | null;
  openPrice: number | null;
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

/** Body of `POST /api/stats` (create) and `PUT /api/stats/{id}` (edit) — backend `StatEntryFormRequest`. */
interface StatEntryWireRequest {
  ticker: string;
  gapUpPercent: number | null;
  openPrice: number | null;
  tradeDate: string;
  source: StatSource;
  floatSharesMillions: number | null;
  institutionsPercent: number | null;
  instOver20: boolean | null;
  under1Dollar: boolean | null;
  ssr: boolean | null;
  entryAfter11am: boolean | null;
  highPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  note: string | null;
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

function toWire(input: StatEntryInput): StatEntryWireRequest {
  return {
    ticker: input.ticker.trim().toUpperCase(),
    gapUpPercent: input.gapUpPercent,
    openPrice: input.openPrice,
    tradeDate: format(input.tradeDate, 'yyyy-MM-dd'),
    source: input.source,
    floatSharesMillions: input.floatSharesMillions,
    institutionsPercent: input.institutionsPercent,
    instOver20: input.instOver20,
    under1Dollar: input.under1Dollar,
    ssr: input.ssr,
    entryAfter11am: input.entryAfter11am,
    highPrice: input.highPrice,
    lodPrice: input.lodPrice,
    eodPrice: input.eodPrice,
    note: input.note?.trim() || null,
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

// Filter → `HttpParams`. Nullish / blank values are omitted so the backend treats them as "no filter
// on that axis". Dates serialise as the local Y/M/D (same convention as the wire `LocalDate`).
function buildFilterParams(filter?: StatEntryFilter): HttpParams {
  let params = new HttpParams();
  if (!filter) return params;
  if (filter.query?.trim()) params = params.set('q', filter.query.trim());
  if (filter.dateFrom) params = params.set('dateFrom', format(filter.dateFrom, 'yyyy-MM-dd'));
  if (filter.dateTo) params = params.set('dateTo', format(filter.dateTo, 'yyyy-MM-dd'));
  if (filter.source) params = params.set('source', filter.source);
  if (filter.gapMin != null) params = params.set('gapMin', String(filter.gapMin));
  if (filter.gapMax != null) params = params.set('gapMax', String(filter.gapMax));
  return params;
}

/**
 * Default adapter for [StatsRepository]. [findAll] reads the filtered, paginated `Page<StatEntry>`
 * from `GET /api/stats`. CRUD goes through `POST` / `PUT` / `DELETE /api/stats` (owner-scoped on the
 * server). [importCsv] / [exportCsv] keep the multipart / blob legs.
 */
@Injectable()
export class HttpStatsRepository extends StatsRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/stats';

  findAll(filter?: StatEntryFilter, page?: PageRequest): Observable<PagedResult<StatEntry>> {
    let params = buildFilterParams(filter);
    if (page) {
      params = params.set('page', page.pageIndex).set('size', page.pageSize);
      if (page.sortField && page.sortDirection) {
        // `createdAt,desc` tie-breaker so a sort on a low-cardinality column stays deterministic
        // across paginated requests (same rationale as the journal adapter).
        params = params
          .append('sort', `${page.sortField},${page.sortDirection}`)
          .append('sort', 'createdAt,desc');
      }
    }
    return this.http
      .get<SpringPageWireDto<StatEntryWireDto>>(this.base, { params })
      .pipe(map((p) => fromPageWire(p)));
  }

  createFromRadar(input: RadarStatInput): Observable<StatEntry> {
    return this.http
      .post<StatEntryWireDto>(this.base, {
        ticker: input.ticker,
        gapUpPercent: input.gapUpPercent,
        openPrice: input.openPrice,
        source: 'RADAR' satisfies StatSource,
      })
      .pipe(map(fromWire));
  }

  create(input: StatEntryInput): Observable<StatEntry> {
    return this.http.post<StatEntryWireDto>(this.base, toWire(input)).pipe(map(fromWire));
  }

  update(id: string, input: StatEntryInput): Observable<StatEntry> {
    return this.http.put<StatEntryWireDto>(`${this.base}/${id}`, toWire(input)).pipe(map(fromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  importCsv(file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResult>(`${this.base}/import`, form);
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
