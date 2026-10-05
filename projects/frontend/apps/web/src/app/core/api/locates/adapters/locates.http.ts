import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { Locate, LocateInput, LocateUpdate } from '../locates.model';
import { LocatesRepository } from '../locates.repository';

interface LocateWireDto {
  id: string;
  tradingDate: string;
  ticker: string;
  shares: number;
  pricePerShare: number;
  stockPrice: number | null;
  cost: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LocateWireRequest {
  tradingDate: string;
  ticker: string;
  shares: number;
  pricePerShare: number;
  stockPrice: number | null;
  note: string | null;
}

function fromWire(w: LocateWireDto): Locate {
  return {
    ...w,
    tradingDate: parseISO(w.tradingDate),
    createdAt: parseISO(w.createdAt),
    updatedAt: parseISO(w.updatedAt),
  };
}

function toWire(input: LocateInput): LocateWireRequest {
  return {
    ...input,
    tradingDate: format(input.tradingDate, 'yyyy-MM-dd'),
    ticker: input.ticker.trim().toUpperCase(),
    note: input.note?.trim() || null,
  };
}

@Injectable()
export class HttpLocatesRepository extends LocatesRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/locates';

  listForDate(date: Date, ticker?: string): Observable<Locate[]> {
    let params = new HttpParams().set('date', format(date, 'yyyy-MM-dd'));
    if (ticker) params = params.set('ticker', ticker);
    return this.http
      .get<LocateWireDto[]>(this.base, { params })
      .pipe(map((rows) => rows.map(fromWire)));
  }

  create(input: LocateInput): Observable<Locate> {
    return this.http.post<LocateWireDto>(this.base, toWire(input)).pipe(map(fromWire));
  }

  update(id: string, update: LocateUpdate): Observable<Locate> {
    return this.http
      .put<LocateWireDto>(`${this.base}/${id}`, { ...update, note: update.note?.trim() || null })
      .pipe(map(fromWire));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
