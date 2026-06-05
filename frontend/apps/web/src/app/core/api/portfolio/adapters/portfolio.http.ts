import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Asset,
  CsvImportPreview,
  CsvImportResult,
  OwnedTicker,
  Portfolio,
  PortfolioRepository,
} from '../portfolio.repository';

@Injectable()
export class HttpPortfolioRepository extends PortfolioRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/portfolios';

  getAll(): Observable<Portfolio[]> {
    return this.http.get<Portfolio[]>(this.base);
  }

  getById(id: string): Observable<Portfolio> {
    return this.http.get<Portfolio>(`${this.base}/${id}`);
  }

  getAssets(portfolioId: string): Observable<Asset[]> {
    return this.http.get<Asset[]>(`${this.base}/${portfolioId}/assets`);
  }

  getOwnedTickers(): Observable<OwnedTicker[]> {
    return this.http.get<OwnedTicker[]>(`${this.base}/owned-tickers`);
  }

  previewCsvImport(file: File): Observable<CsvImportPreview> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CsvImportPreview>(`${this.base}/import/csv/preview`, form);
  }

  confirmCsvImport(file: File): Observable<CsvImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CsvImportResult>(`${this.base}/import/csv`, form);
  }
}
