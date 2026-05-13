import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  NarrativeObservabilityRepository,
  NarrativeObservations,
  NarrativeObservationsFilter,
} from '../narrative-observability.repository';

@Injectable()
export class HttpNarrativeObservabilityRepository extends NarrativeObservabilityRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/narrative/observability';

  findFor(symbol: string, filter?: NarrativeObservationsFilter): Observable<NarrativeObservations> {
    let params = new HttpParams();
    if (filter?.from) params = params.set('from', filter.from);
    if (filter?.to) params = params.set('to', filter.to);
    // Mirror the controller query-param name (`promptId`), not the internal Kotlin name
    // (`promptTemplateId`). A rename here breaks the backend route silently.
    if (filter?.promptId) params = params.set('promptId', filter.promptId);
    return this.http.get<NarrativeObservations>(`${this.base}/${encodeURIComponent(symbol)}`, {
      params,
    });
  }
}
