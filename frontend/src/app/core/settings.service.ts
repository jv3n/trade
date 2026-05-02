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

export interface RawArticle {
  title: string;
  link: string | null;
  publishedAt: string | null;
}

export interface SourceTestResult {
  ok: boolean;
  error: string | null;
  message: string | null;
  itemCount: number;
  items: RawArticle[];
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

  testSource(id: string): Observable<SourceTestResult> {
    return this.http.get<SourceTestResult>(`/api/ingestion/sources/${id}/test`);
  }
}
