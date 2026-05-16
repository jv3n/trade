import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigEntry, ConfigRepository, TestConfigResult } from '../config.repository';

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

  testTwelveData(value: string): Observable<TestConfigResult> {
    return this.http.post<TestConfigResult>(`${this.base}/test/twelvedata`, { value });
  }

  testFinnhub(value: string): Observable<TestConfigResult> {
    return this.http.post<TestConfigResult>(`${this.base}/test/finnhub`, { value });
  }

  testAnthropic(value: string): Observable<TestConfigResult> {
    return this.http.post<TestConfigResult>(`${this.base}/test/anthropic`, { value });
  }

  testLlm(provider: string, model: string): Observable<TestConfigResult> {
    return this.http.post<TestConfigResult>(`${this.base}/test/llm`, { provider, model });
  }
}
