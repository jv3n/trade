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

export abstract class SettingsRepository {
  abstract getSources(): Observable<DataSource[]>;
  abstract updateEnabled(id: string, enabled: boolean): Observable<DataSource>;
  abstract testSource(id: string): Observable<SourceTestResult>;
}
