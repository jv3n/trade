import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { JournalRepository } from '../journal.repository';
import {
  TradeEntry,
  TradeEntryFilter,
  TradeEntryInput,
  TradeExitStrategy,
  TradeOpenSide,
  TradePattern,
  TradePlay,
} from '../trade-entry.model';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/journal/trades`.
//
// Kept private to this file : `JournalRepository` consumers only ever see the domain types.
// The only difference from [TradeEntry] is the date serialisation : Spring serialises
// `LocalDate` as `YYYY-MM-DD` and `Instant` as ISO-8601 with `Z`.
// ---------------------------------------------------------------------------

interface TradeEntryWireDto {
  id: string;
  tradeDate: string;
  ticker: string;
  play: TradePlay;
  pattern: TradePattern;
  size: number;
  openPrice: number;
  exitPrice: number | null;
  profitDollars: number | null;
  gainPercent: number | null;
  note: string | null;
  pre935To10h: boolean | null;
  preGapUp50: boolean | null;
  prePrice1To10: boolean | null;
  preFloat3To50m: boolean | null;
  preWaitPush: boolean | null;
  openSide: TradeOpenSide | null;
  shortOnResistance: boolean | null;
  exitStrategy: TradeExitStrategy | null;
  errorNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TradeEntryWireRequest {
  tradeDate: string;
  ticker: string;
  play: TradePlay;
  pattern: TradePattern;
  size: number;
  openPrice: number;
  exitPrice: number | null;
  profitDollars: number | null;
  gainPercent: number | null;
  note: string | null;
  pre935To10h: boolean | null;
  preGapUp50: boolean | null;
  prePrice1To10: boolean | null;
  preFloat3To50m: boolean | null;
  preWaitPush: boolean | null;
  openSide: TradeOpenSide | null;
  shortOnResistance: boolean | null;
  exitStrategy: TradeExitStrategy | null;
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

function fromWire(w: TradeEntryWireDto): TradeEntry {
  return {
    id: w.id,
    tradeDate: parseISO(w.tradeDate),
    ticker: w.ticker,
    play: w.play,
    pattern: w.pattern,
    size: w.size,
    openPrice: w.openPrice,
    exitPrice: w.exitPrice,
    profitDollars: w.profitDollars,
    gainPercent: w.gainPercent,
    note: w.note,
    pre935To10h: w.pre935To10h,
    preGapUp50: w.preGapUp50,
    prePrice1To10: w.prePrice1To10,
    preFloat3To50m: w.preFloat3To50m,
    preWaitPush: w.preWaitPush,
    openSide: w.openSide,
    shortOnResistance: w.shortOnResistance,
    exitStrategy: w.exitStrategy,
    errorNote: w.errorNote,
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function toWire(input: TradeEntryInput): TradeEntryWireRequest {
  return {
    tradeDate: format(input.tradeDate, 'yyyy-MM-dd'),
    ticker: input.ticker.trim().toUpperCase(),
    play: input.play,
    pattern: input.pattern,
    size: input.size,
    openPrice: input.openPrice,
    exitPrice: input.exitPrice,
    profitDollars: input.profitDollars,
    gainPercent: input.gainPercent,
    note: input.note?.trim() || null,
    pre935To10h: input.pre935To10h,
    preGapUp50: input.preGapUp50,
    prePrice1To10: input.prePrice1To10,
    preFloat3To50m: input.preFloat3To50m,
    preWaitPush: input.preWaitPush,
    openSide: input.openSide,
    shortOnResistance: input.shortOnResistance,
    exitStrategy: input.exitStrategy,
    errorNote: input.errorNote?.trim() || null,
  };
}

// Filter → `HttpParams`. Multi-value fields (`plays`, `patterns`) use the repeated
// `?play=A&play=B` form Spring expects ; empty arrays / blank strings / nullish values are
// omitted entirely so the backend treats them as "no filter on that axis".
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
  for (const p of filter.plays ?? []) {
    params = params.append('play', p);
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

  findAll(filter?: TradeEntryFilter): Observable<TradeEntry[]> {
    return this.http
      .get<TradeEntryWireDto[]>(this.base, { params: buildFilterParams(filter) })
      .pipe(map((list) => list.map(fromWire)));
  }

  findById(id: string): Observable<TradeEntry> {
    return this.http.get<TradeEntryWireDto>(`${this.base}/${id}`).pipe(map(fromWire));
  }

  create(input: TradeEntryInput): Observable<TradeEntry> {
    return this.http.post<TradeEntryWireDto>(this.base, toWire(input)).pipe(map(fromWire));
  }

  update(id: string, input: TradeEntryInput): Observable<TradeEntry> {
    return this.http
      .put<TradeEntryWireDto>(`${this.base}/${id}`, toWire(input))
      .pipe(map(fromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
