import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OllamaStatus, OllamaStatusRepository } from '../ollama-status.repository';

@Injectable()
export class HttpOllamaStatusRepository extends OllamaStatusRepository {
  private readonly http = inject(HttpClient);

  get(): Observable<OllamaStatus> {
    return this.http.get<OllamaStatus>('/api/config/llm/status');
  }

  unload(model: string): Observable<OllamaStatus> {
    return this.http.post<OllamaStatus>('/api/config/llm/unload-model', { model });
  }
}
