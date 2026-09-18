import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { ForexRate } from '../forex.model';
import { ForexRepository } from '../forex.repository';

/** Wire shape Spring serialises on `/api/forex/rate` — identical to the domain bar the ISO `asOf`. */
interface ForexRateWireDto {
  base: string;
  quote: string;
  rate: number;
  asOf: string;
}

@Injectable()
export class HttpForexRepository extends ForexRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/forex';

  latestRate(base = 'USD', quote = 'CAD'): Observable<ForexRate> {
    const params = new HttpParams().set('base', base).set('quote', quote);
    return this.http.get<ForexRateWireDto>(`${this.base}/rate`, { params }).pipe(
      map((w) => ({
        base: w.base,
        quote: w.quote,
        rate: w.rate,
        asOf: parseISO(w.asOf),
      })),
    );
  }
}
