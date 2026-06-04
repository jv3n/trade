import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ScreenerRepository, ScreenerSnapshotResponse } from '../screener.repository';

/**
 * HTTP adapter for [ScreenerRepository]. Two paths after Phase 6 ticket (9) :
 * - `refresh()` → `POST /api/screener/refresh` — server-side fetch + persist, returns the fresh
 *   envelope. Body is empty ; the active provider is resolved server-side via [AppConfigService].
 * - `loadSnapshot(date?)` → `GET /api/screener/movers` (with optional `?date=YYYY-MM-DD`) — reads
 *   the persisted envelope. No filter query params ; the dynamic filter runs client-side on the
 *   raw movers list.
 */
@Injectable()
export class HttpScreenerRepository extends ScreenerRepository {
  private readonly http = inject(HttpClient);

  refresh(): Observable<ScreenerSnapshotResponse> {
    return this.http.post<ScreenerSnapshotResponse>('/api/screener/refresh', null);
  }

  loadSnapshot(date?: string | null): Observable<ScreenerSnapshotResponse> {
    const params = date ? new HttpParams().set('date', date) : undefined;
    return this.http.get<ScreenerSnapshotResponse>('/api/screener/movers', { params });
  }
}
