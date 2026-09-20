import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { TradeEntryWireDto, tradeEntryFromWire } from '../../journal/adapters/journal.http';
import { TradeEntry } from '../../journal/trade-entry.model';
import { Pattern } from '../../shared/pattern.model';
import {
  PageRequest,
  PagedResult,
  StatEntry,
  StatEntryFilter,
  StatEntryInput,
  StatSummary,
} from '../stat-entry.model';
import { StatsRepository } from '../stats.repository';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/stats`. Kept private : consumers only ever
// see the domain [StatEntry] / [StatEntryInput]. Spring emits `LocalDate` as `YYYY-MM-DD` and
// `Instant` as ISO-8601 with `Z` ; the request sends `LocalDate` strings back the same way.
// ---------------------------------------------------------------------------

interface StatEntryWireDto {
  id: string;
  candidateId: string | null;
  tradeDate: string;
  pattern: Pattern;
  ticker: string;
  previousClose: number;
  pmOpen: number;
  pmHigh: number;
  floatMillions: number | null;
  volumeMillions: number | null;
  locatePerShare: number | null;
  note: string | null;
  openPrice: number | null;
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  ssr: boolean;
  under1Dollar: boolean;
  entryAfter11am: boolean;
  completed: boolean;
  tradeId: string | null;
  tradeRetainedProfitDollars: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Body of `PUT /api/stats/{id}` — the backend `StatEntryRequest`. */
type StatEntryWireRequest = Omit<
  StatEntryWireDto,
  | 'id'
  | 'candidateId'
  | 'completed'
  | 'tradeId'
  | 'tradeRetainedProfitDollars'
  | 'createdAt'
  | 'updatedAt'
>;

// `parseISO('2026-06-04')` → midnight LOCAL (no UTC shift) ; `parseISO('…Z')` → instant. Same
// convention as the journal adapter.
function fromWire(w: StatEntryWireDto): StatEntry {
  return {
    ...w,
    tradeDate: parseISO(w.tradeDate),
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function toWire(input: StatEntryInput): StatEntryWireRequest {
  return {
    ...input,
    tradeDate: format(input.tradeDate, 'yyyy-MM-dd'),
    ticker: input.ticker.trim().toUpperCase(),
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
  if (filter.pattern) params = params.set('pattern', filter.pattern);
  if (filter.status) params = params.set('status', filter.status);
  return params;
}

/**
 * Default adapter for [StatsRepository]. [findAll] reads the filtered, paginated `Page<StatEntry>`
 * from `GET /api/stats` and [summary] the KPIs of the same filter ; [update] / [delete] are
 * user-scoped on the server. [exportCsv] keeps the blob leg.
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

  summary(filter?: StatEntryFilter): Observable<StatSummary> {
    return this.http.get<StatSummary>(`${this.base}/summary`, {
      params: buildFilterParams(filter),
    });
  }

  update(id: string, input: StatEntryInput): Observable<StatEntry> {
    return this.http.put<StatEntryWireDto>(`${this.base}/${id}`, toWire(input)).pipe(map(fromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * « → Trade » (#193). The response is a **journal** trade, so the wire mapping is borrowed from
   * the journal adapter instead of being duplicated here — one owner per wire format.
   */
  promoteToTrade(id: string): Observable<TradeEntry> {
    return this.http
      .post<TradeEntryWireDto>(`${this.base}/${id}/trade`, null)
      .pipe(map(tradeEntryFromWire));
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
