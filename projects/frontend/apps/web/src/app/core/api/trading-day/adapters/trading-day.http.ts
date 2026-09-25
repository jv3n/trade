import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { format, parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { TradingDay, TradingDayMarks } from '../trading-day.model';
import { TradingDayRepository } from '../trading-day.repository';

interface TradingDayWireDto {
  tradingDate: string;
  noCandidateAt: string | null;
  noTradeAt: string | null;
}

function fromWire(w: TradingDayWireDto): TradingDay {
  return {
    tradingDate: parseISO(w.tradingDate),
    noCandidateAt: w.noCandidateAt ? parseISO(w.noCandidateAt) : null,
    noTradeAt: w.noTradeAt ? parseISO(w.noTradeAt) : null,
  };
}

@Injectable()
export class HttpTradingDayRepository extends TradingDayRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/trading-days';

  get(date: Date): Observable<TradingDay> {
    return this.http
      .get<TradingDayWireDto>(`${this.base}/${format(date, 'yyyy-MM-dd')}`)
      .pipe(map(fromWire));
  }

  put(date: Date, marks: TradingDayMarks): Observable<TradingDay> {
    return this.http
      .put<TradingDayWireDto>(`${this.base}/${format(date, 'yyyy-MM-dd')}`, marks)
      .pipe(map(fromWire));
  }
}
