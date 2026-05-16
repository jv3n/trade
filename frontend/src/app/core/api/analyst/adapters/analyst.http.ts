import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AnalystRepository, AnalystSnapshot } from '../analyst.repository';

@Injectable()
export class HttpAnalystRepository extends AnalystRepository {
  private readonly http = inject(HttpClient);

  getForSymbol(symbol: string): Observable<AnalystSnapshot> {
    return this.http.get<AnalystSnapshot>(
      `/api/market/ticker/${encodeURIComponent(symbol)}/analyst-recommendations`,
    );
  }
}
