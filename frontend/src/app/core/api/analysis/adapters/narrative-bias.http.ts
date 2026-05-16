import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  NarrativeBias,
  NarrativeBiasFilter,
  NarrativeBiasRepository,
} from '../narrative-bias.repository';

/**
 * HTTP adapter for the Phase 3 #3 bias dashboard endpoint. The URL is intentionally a sibling of
 * the timeline endpoint (`/api/narrative/observability/bias` vs `…/{symbol}`) so the two share the
 * same controller and the same routing precedence rules : the literal `/bias` segment is matched
 * before the `/{symbol}` path variable on the backend.
 */
@Injectable()
export class HttpNarrativeBiasRepository extends NarrativeBiasRepository {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/narrative/observability/bias';

  findBias(filter?: NarrativeBiasFilter): Observable<NarrativeBias> {
    let params = new HttpParams();
    if (filter?.from) params = params.set('from', filter.from);
    if (filter?.to) params = params.set('to', filter.to);
    // Mirror the controller query-param name (`promptId`), not the internal Kotlin name
    // (`promptTemplateId`). A rename here breaks the backend route silently.
    if (filter?.promptId) params = params.set('promptId', filter.promptId);
    return this.http.get<NarrativeBias>(this.url, { params });
  }
}
