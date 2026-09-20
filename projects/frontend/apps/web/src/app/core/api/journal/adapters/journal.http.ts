import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { Pattern } from '../../shared/pattern.model';
import { ImportResult, JournalRepository, PageRequest, PagedResult } from '../journal.repository';
import {
  ExecutionKind,
  JournalSummary,
  TradeDirection,
  TradeEntry,
  TradeEntryFilter,
  TradeEntryInput,
  TradeExecution,
} from '../trade-entry.model';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/journal/trades`.
//
// Kept private to this file : `JournalRepository` consumers only ever see the domain types.
// The only difference from [TradeEntry] is the date serialisation : Spring serialises
// `LocalDate` as `YYYY-MM-DD` and `Instant` as ISO-8601 with `Z`.
// ---------------------------------------------------------------------------

interface ExecutionWireDto {
  seq: number;
  kind: ExecutionKind;
  shares: number;
  price: number;
  executedAt: string | null;
}

interface ExecutionWireRequest {
  kind: ExecutionKind;
  shares: number;
  price: number;
  executedAt: string | null;
}

/**
 * Exported for the stats adapter : « → Trade » (#193) answers with a journal trade, and the wire
 * format keeps a single owner — this file — rather than being re-parsed over there.
 */
export interface TradeEntryWireDto {
  id: string;
  statEntryId: string;
  tradeDate: string;
  ticker: string;
  pattern: Pattern;
  direction: TradeDirection | null;
  executions: ExecutionWireDto[];
  size: number | null;
  openPrice: number | null;
  exitPrice: number | null;
  gainPercent: number | null;
  profitDollars: number | null;
  realProfitDollars: number | null;
  retainedProfitDollars: number | null;
  retainedGainPercent: number | null;
  durationMinutes: number | null;
  note: string | null;
  errorNote: string | null;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TradeEntryWireRequest {
  statEntryId: string;
  tradeDate: string;
  ticker: string;
  pattern: Pattern | null;
  direction: TradeDirection | null;
  executions: ExecutionWireRequest[];
  realProfitDollars: number | null;
  note: string | null;
  errorNote: string | null;
}

// ---------------------------------------------------------------------------
// Mapping — wire ↔ domain. Both directions live here so the adapter is the **single place**
// that knows about the wire format. Application code only ever sees `Date` and `TradeEntry`.
// ---------------------------------------------------------------------------

// All date parsing/formatting uses `date-fns`. `parseISO` is timezone-aware :
//   - `'2026-06-04'`             → `Date` at midnight LOCAL time (no UTC shift)
//   - `'2026-06-04T15:30:00Z'`   → instant `Date`
// `format(d, 'yyyy-MM-dd')` uses the local Y/M/D — same intent as `parseISO` of the same
// shape, so a round-trip preserves the user's day.

function executionFromWire(w: ExecutionWireDto): TradeExecution {
  return {
    seq: w.seq,
    kind: w.kind,
    shares: w.shares,
    price: w.price,
    // Spring serialises `LocalTime` as `HH:mm` (or `HH:mm:ss`) — kept as a string, the fill time
    // is a wall-clock on the trade's own day, never an instant.
    executedAt: w.executedAt,
  };
}

export function tradeEntryFromWire(w: TradeEntryWireDto): TradeEntry {
  return {
    id: w.id,
    statEntryId: w.statEntryId,
    tradeDate: parseISO(w.tradeDate),
    ticker: w.ticker,
    pattern: w.pattern,
    direction: w.direction,
    executions: (w.executions ?? []).map(executionFromWire),
    size: w.size,
    openPrice: w.openPrice,
    exitPrice: w.exitPrice,
    gainPercent: w.gainPercent,
    profitDollars: w.profitDollars,
    realProfitDollars: w.realProfitDollars,
    retainedProfitDollars: w.retainedProfitDollars,
    retainedGainPercent: w.retainedGainPercent,
    durationMinutes: w.durationMinutes,
    note: w.note,
    errorNote: w.errorNote,
    hasScreenshot: w.hasScreenshot,
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function toWire(input: TradeEntryInput): TradeEntryWireRequest {
  return {
    statEntryId: input.statEntryId,
    tradeDate: format(input.tradeDate, 'yyyy-MM-dd'),
    ticker: input.ticker.trim().toUpperCase(),
    pattern: input.pattern,
    direction: input.direction,
    executions: input.executions.map((e) => ({
      kind: e.kind,
      shares: e.shares,
      price: e.price,
      executedAt: e.executedAt,
    })),
    realProfitDollars: input.realProfitDollars,
    note: input.note?.trim() || null,
    errorNote: input.errorNote?.trim() || null,
  };
}

// Spring's `Page<T>` JSON shape — keeps the fields we actually use (`content`, `number`,
// `size`, `totalElements`, `totalPages`). Spring serialises the page index as `number` ;
// we rename to `pageIndex` in the domain type so the consumer doesn't grep the wrong field.
interface SpringPageWireDto<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

function fromPageWire(p: SpringPageWireDto<TradeEntryWireDto>): PagedResult<TradeEntry> {
  return {
    content: p.content.map(tradeEntryFromWire),
    pageIndex: p.number,
    pageSize: p.size,
    totalElements: p.totalElements,
    totalPages: p.totalPages,
  };
}

// Filter → `HttpParams`. The multi-value `patterns` field uses the repeated
// `?pattern=GUS&pattern=DT` form Spring expects ; empty arrays / blank strings / nullish values
// are omitted entirely so the backend treats them as "no filter on that axis".
function buildFilterParams(filter?: TradeEntryFilter): HttpParams {
  let params = new HttpParams();
  if (!filter) return params;

  if (filter.query?.trim()) {
    params = params.set('q', filter.query.trim());
  }
  if (filter.dateFrom) {
    params = params.set('dateFrom', format(filter.dateFrom, 'yyyy-MM-dd'));
  }
  if (filter.dateTo) {
    params = params.set('dateTo', format(filter.dateTo, 'yyyy-MM-dd'));
  }
  for (const p of filter.patterns ?? []) {
    params = params.append('pattern', p);
  }
  if (filter.status) {
    params = params.set('status', filter.status);
  }
  return params;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

@Injectable()
export class HttpJournalRepository extends JournalRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/journal/trades';

  findAll(filter?: TradeEntryFilter, page?: PageRequest): Observable<PagedResult<TradeEntry>> {
    let params = buildFilterParams(filter);
    if (page) {
      params = params.set('page', page.pageIndex).set('size', page.pageSize);
      if (page.sortField && page.sortDirection) {
        // Spring's `Pageable` accepts `?sort=field,direction` repeatedly — when several `sort`
        // params are present, they apply in order, the first one being primary.
        //
        // **Why two sort axes** : Material's MatSort emits only one (active, direction), but
        // sorting on a low-cardinality column (`play`, `pattern`) creates massive ties — and
        // SQL doesn't guarantee a stable order for tied rows. With pagination on top, the same
        // trade could appear on two consecutive pages or jump between them when the user
        // navigates. We append `createdAt,desc` as a **tie-breaker** so the order is always
        // deterministic across requests, regardless of the user's chosen primary sort.
        params = params
          .append('sort', `${page.sortField},${page.sortDirection}`)
          .append('sort', 'createdAt,desc');
      }
    }
    return this.http
      .get<SpringPageWireDto<TradeEntryWireDto>>(this.base, { params })
      .pipe(map((p) => fromPageWire(p)));
  }

  findById(id: string): Observable<TradeEntry> {
    return this.http.get<TradeEntryWireDto>(`${this.base}/${id}`).pipe(map(tradeEntryFromWire));
  }

  // The summary carries no date / decimal quirk — the wire shape is the domain shape.
  summary(filter?: TradeEntryFilter): Observable<JournalSummary> {
    return this.http.get<JournalSummary>(`${this.base}/summary`, {
      params: buildFilterParams(filter),
    });
  }

  // No create : a trade is born from a stat, through `StatsRepository.promoteToTrade` (#193).

  update(id: string, input: TradeEntryInput): Observable<TradeEntry> {
    return this.http
      .put<TradeEntryWireDto>(`${this.base}/${id}`, toWire(input))
      .pipe(map(tradeEntryFromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * Streams the export endpoint as a binary `Blob` so the consumer can hand it to a download
   * trick (`URL.createObjectURL` + anchor click). The server sets the `Content-Disposition`
   * filename ; the consumer here just cares about the body.
   */
  exportCsv(): Observable<Blob> {
    return this.http.get(`${this.base}/export`, {
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    });
  }

  /**
   * Posts the picked file as `multipart/form-data` to the import endpoint. The server always
   * returns 200 with an [ImportResult] — per-row errors are surfaced in the body so we can
   * render them inline without a 4xx detour.
   */
  importCsv(file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResult>(`${this.base}/import`, form);
  }

  uploadScreenshot(id: string, file: File): Observable<TradeEntry> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http
      .post<TradeEntryWireDto>(`${this.base}/${id}/screenshot`, form)
      .pipe(map(tradeEntryFromWire));
  }

  getScreenshotBlob(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/screenshot`, { responseType: 'blob' });
  }

  deleteScreenshot(id: string): Observable<TradeEntry> {
    return this.http
      .delete<TradeEntryWireDto>(`${this.base}/${id}/screenshot`)
      .pipe(map(tradeEntryFromWire));
  }
}
