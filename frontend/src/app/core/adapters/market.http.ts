import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MarketRepository, TickerSnapshot } from '../market.repository';

@Injectable()
export class HttpMarketRepository extends MarketRepository {
  private readonly http = inject(HttpClient);

  getTicker(symbol: string): Observable<TickerSnapshot> {
    return this.http.get<TickerSnapshot>(`/api/market/ticker/${encodeURIComponent(symbol)}`);
  }
}
