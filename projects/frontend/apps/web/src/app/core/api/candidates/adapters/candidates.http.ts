import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { Pattern } from '../../shared/pattern.model';
import { Candidate, CandidateInput } from '../candidates.model';
import { CandidatesRepository } from '../candidates.repository';

// ---------------------------------------------------------------------------
// Wire DTOs — the shape Spring Boot serialises on `/api/candidates`. Kept private : consumers of
// `CandidatesRepository` only ever see the domain types. The only delta from the domain is the date
// serialisation (`LocalDate` → `YYYY-MM-DD`, `Instant` → ISO-8601 `Z`).
// ---------------------------------------------------------------------------

interface CandidateWireDto {
  id: string;
  tradingDate: string;
  pattern: Pattern;
  ticker: string;
  previousClose: number;
  pmOpen: number;
  pmHigh: number;
  floatMillions: number | null;
  volumeMillions: number | null;
  locatePerShare: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

type CandidateWireRequest = Omit<CandidateWireDto, 'id' | 'createdAt' | 'updatedAt'>;

function fromWire(w: CandidateWireDto): Candidate {
  return {
    ...w,
    tradingDate: parseISO(w.tradingDate),
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function toWire(input: CandidateInput): CandidateWireRequest {
  return {
    ...input,
    tradingDate: format(input.tradingDate, 'yyyy-MM-dd'),
    ticker: input.ticker.trim(),
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
