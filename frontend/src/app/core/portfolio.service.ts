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

export interface CreatePortfolioRequest {
  name: string;
  description?: string;
}

export interface CreateAssetRequest {
  ticker: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  assetType: AssetType;
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

  create(request: CreatePortfolioRequest): Observable<Portfolio> {
    return this.http.post<Portfolio>(this.base, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getAssets(portfolioId: string): Observable<Asset[]> {
    return this.http.get<Asset[]>(`${this.base}/${portfolioId}/assets`);
  }

  addAsset(portfolioId: string, request: CreateAssetRequest): Observable<Asset> {
    return this.http.post<Asset>(`${this.base}/${portfolioId}/assets`, request);
  }

  removeAsset(portfolioId: string, assetId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${portfolioId}/assets/${assetId}`);
  }
}
