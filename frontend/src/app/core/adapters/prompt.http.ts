import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreatePromptInput, PromptRepository, PromptTemplate } from '../prompt.repository';

@Injectable()
export class HttpPromptRepository extends PromptRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/prompts';

  list(name?: string): Observable<PromptTemplate[]> {
    const params = name ? new HttpParams().set('name', name) : undefined;
    return this.http.get<PromptTemplate[]>(this.base, { params });
  }

  get(id: string): Observable<PromptTemplate> {
    return this.http.get<PromptTemplate>(`${this.base}/${encodeURIComponent(id)}`);
  }

  activate(id: string): Observable<PromptTemplate> {
    return this.http.post<PromptTemplate>(`${this.base}/${encodeURIComponent(id)}/activate`, null);
  }

  create(input: CreatePromptInput): Observable<PromptTemplate> {
    return this.http.post<PromptTemplate>(this.base, input);
  }
}
