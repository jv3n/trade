import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigEntry, ConfigRepository } from '../config.repository';

@Injectable()
export class HttpConfigRepository extends ConfigRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/config';

  list(): Observable<ConfigEntry[]> {
    return this.http.get<ConfigEntry[]>(this.base);
  }

  set(key: string, value: string): Observable<ConfigEntry> {
    return this.http.put<ConfigEntry>(`${this.base}/${encodeURIComponent(key)}`, { value });
  }

  reset(key: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(key)}`);
  }
}
