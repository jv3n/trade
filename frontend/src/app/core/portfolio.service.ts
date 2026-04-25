import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type AssetType = 'ETF' | 'STOCK' | 'COMMODITY' | 'CRYPTO' | 'BOND';

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
}

export interface Asset {
  id: string;
  portfolioId: string;
  ticker: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  assetType: AssetType;
  totalValue: number;
  createdAt: string;
}

export interface CsvImportPreviewItem {
  ticker: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  assetType: string;
  bookValue: number;
  currency: string;
}

export interface AccountImportPreview {
  accountName: string;
  items: CsvImportPreviewItem[];
}

export interface CsvImportPreview {
  accounts: AccountImportPreview[];
  totalItems: number;
  skippedRows: number;
  warnings: string[];
}

export interface CsvImportResult {
  portfoliosCreated: number;
  portfoliosUpdated: number;
  totalImported: number;
  skipped: number;
}

@Injectable({ providedIn: 'root' })
export class PortfolioService {
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
