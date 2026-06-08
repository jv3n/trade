import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ImportResult, StatsRepository } from '../stats.repository';

/**
 * Default adapter for [StatsRepository]. [importCsv] posts the picked file as `multipart/form-data`
 * to `POST /api/stats/import` — the server always returns 200 with an [ImportResult] (per-row errors
 * are in the body, not a 4xx), so the consumer can render diagnostics inline. [exportCsv] streams
 * `GET /api/stats/export` as a binary `Blob` for the download trick.
 */
@Injectable()
export class HttpStatsRepository extends StatsRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/stats';

  importCsv(file: File): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportResult>(`${this.base}/import`, form);
  }

  /**
   * Streams the export endpoint as a binary `Blob` so the consumer can hand it to a download trick
   * (`URL.createObjectURL` + anchor click). The server sets the `Content-Disposition` filename.
   */
  exportCsv(): Observable<Blob> {
    return this.http.get(`${this.base}/export`, {
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    });
  }
}
