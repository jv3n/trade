import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NewsItem, NewsRepository } from '../news.repository';

@Injectable()
export class HttpNewsRepository extends NewsRepository {
  private readonly http = inject(HttpClient);

  getForSymbol(symbol: string, limit = 10): Observable<NewsItem[]> {
    return this.http.get<NewsItem[]>(`/api/market/ticker/${encodeURIComponent(symbol)}/news`, {
      params: { limit: String(limit) },
    });
  }
}
