import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SettingsRepository, DataSource, SourceTestResult } from '../settings.repository';

@Injectable()
export class HttpSettingsRepository extends SettingsRepository {
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
