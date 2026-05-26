import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ScreenerFilter, ScreenerRepository, TickerMover } from '../screener.repository';

/**
 * HTTP adapter for `ScreenerRepository`. Maps the filter into query params — `null` fields are
 * dropped so the backend uses its own defaults (gap≥5 %, volume≥3×) when the caller doesn't
 * override. Keeps the wire-level contract minimal : no body, no envelope, just `?param=value`.
 */
@Injectable()
export class HttpScreenerRepository extends ScreenerRepository {
  private readonly http = inject(HttpClient);

  findMovers(filter: ScreenerFilter): Observable<TickerMover[]> {
    let params = new HttpParams()
      .set('gapPctMin', String(filter.gapPctMin))
      .set('volumeRatioMin', String(filter.volumeRatioMin));
    if (filter.marketCapMin !== null) {
      params = params.set('marketCapMin', String(filter.marketCapMin));
    }
    if (filter.marketCapMax !== null) {
      params = params.set('marketCapMax', String(filter.marketCapMax));
    }
    if (filter.exchange !== null) {
      params = params.set('exchange', filter.exchange);
    }
    if (filter.sector !== null) {
      params = params.set('sector', filter.sector);
    }
    return this.http.get<TickerMover[]>('/api/screener/movers', { params });
  }
}
