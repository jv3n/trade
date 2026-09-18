import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import {
  Candidate,
  CandidateEntry,
  CandidateExit,
  CandidateFill,
  CandidateInput,
} from '../candidates.model';
import { CandidatesRepository } from '../candidates.repository';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/candidates`. Kept private : consumers of
// `CandidatesRepository` only ever see the domain types. The only delta from the domain is the date
// serialisation (`LocalDate` → `YYYY-MM-DD`, `Instant` → ISO-8601 `Z`). The `fills` / `entries` /
// `exits` arrays are plain numbers on both sides, so they pass through untouched.
// ---------------------------------------------------------------------------

interface CandidateWireDto {
  id: string;
  tradingDate: string;
  ticker: string;
  totalCapital: number;
  pctCapitalAtRisk: number;
  openPrice: number;
  stopPct: number | null;
  previousClose: number | null;
  floatShares: number | null;
  volume: number | null;
  morningPush: number | null;
  borrowCostPerShare: number | null;
  fills: CandidateFill[];
  entries: CandidateEntry[];
  exits: CandidateExit[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CandidateWireRequest {
  tradingDate: string;
  ticker: string;
  totalCapital: number;
  pctCapitalAtRisk: number;
  openPrice: number;
  stopPct: number | null;
  previousClose: number | null;
  floatShares: number | null;
  volume: number | null;
  morningPush: number | null;
  borrowCostPerShare: number | null;
  fills: CandidateFill[];
  entries: CandidateEntry[];
  exits: CandidateExit[];
  note: string | null;
}

function fromWire(w: CandidateWireDto): Candidate {
  return {
    id: w.id,
    tradingDate: parseISO(w.tradingDate),
    ticker: w.ticker,
    totalCapital: w.totalCapital,
    pctCapitalAtRisk: w.pctCapitalAtRisk,
    openPrice: w.openPrice,
    stopPct: w.stopPct,
    previousClose: w.previousClose,
    floatShares: w.floatShares,
    volume: w.volume,
    morningPush: w.morningPush,
    borrowCostPerShare: w.borrowCostPerShare,
    fills: w.fills,
    entries: w.entries,
    exits: w.exits,
    note: w.note,
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function toWire(input: CandidateInput): CandidateWireRequest {
  return {
    tradingDate: format(input.tradingDate, 'yyyy-MM-dd'),
    ticker: input.ticker.trim(),
    totalCapital: input.totalCapital,
    pctCapitalAtRisk: input.pctCapitalAtRisk,
    openPrice: input.openPrice,
    stopPct: input.stopPct,
    previousClose: input.previousClose,
    floatShares: input.floatShares,
    volume: input.volume,
    morningPush: input.morningPush,
    borrowCostPerShare: input.borrowCostPerShare,
    fills: input.fills,
    entries: input.entries,
    exits: input.exits,
    note: input.note?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

@Injectable()
export class HttpCandidatesRepository extends CandidatesRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/candidates';

  listForDate(date: Date): Observable<Candidate[]> {
    const params = new HttpParams().set('date', format(date, 'yyyy-MM-dd'));
    return this.http
      .get<CandidateWireDto[]>(this.base, { params })
      .pipe(map((rows) => rows.map(fromWire)));
  }

  get(id: string): Observable<Candidate> {
    return this.http.get<CandidateWireDto>(`${this.base}/${id}`).pipe(map(fromWire));
  }

  create(input: CandidateInput): Observable<Candidate> {
    return this.http.post<CandidateWireDto>(this.base, toWire(input)).pipe(map(fromWire));
  }

  update(id: string, input: CandidateInput): Observable<Candidate> {
    return this.http.put<CandidateWireDto>(`${this.base}/${id}`, toWire(input)).pipe(map(fromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
