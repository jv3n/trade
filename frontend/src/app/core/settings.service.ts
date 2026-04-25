import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SourceCategory = 'RSS' | 'MARKET' | 'MACRO' | 'CRYPTO';

export interface DataSource {
  id: string;
  slug: string;
  name: string;
  url: string;
  category: SourceCategory;
  enabled: boolean;
  description: string;
  free: boolean;
  requiresApiKey: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  getSources(): Observable<DataSource[]> {
    return this.http.get<DataSource[]>('/api/ingestion/sources');
  }

  updateEnabled(id: string, enabled: boolean): Observable<DataSource> {
    return this.http.patch<DataSource>(`/api/ingestion/sources/${id}`, { enabled });
  }
}
