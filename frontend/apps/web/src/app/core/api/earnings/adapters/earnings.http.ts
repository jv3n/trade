import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { EarningsRepository, EarningsSnapshot } from '../earnings.repository';

@Injectable()
export class HttpEarningsRepository extends EarningsRepository {
  private readonly http = inject(HttpClient);

  getForSymbol(symbol: string): Observable<EarningsSnapshot> {
    return this.http.get<EarningsSnapshot>(
      `/api/market/ticker/${encodeURIComponent(symbol)}/earnings`,
    );
  }
}
