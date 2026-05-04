import { Observable } from 'rxjs';

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  summary: string | null;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  category: string | null;
}

/**
 * Port — read-only access to the per-ticker news feed. Backed by Finnhub via the backend
 * `news/` module ; provider details stay server-side.
 */
export abstract class NewsRepository {
  abstract getForSymbol(symbol: string, limit?: number): Observable<NewsItem[]>;
}
