import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SnapshotSummary {
  id: string;
  batchId: string;
  portfolioId: string;
  portfolioName: string;
  importedAt: string;
  positionCount: number;
  totalBookValueCad: number;
}

export interface SnapshotPosition {
  ticker: string;
  name: string;
  assetType: string;
  quantity: number;
  bookValueCad: number;
  marketValue: number;
  marketCurrency: string;
  unrealizedGain: number | null;
  gainCurrency: string | null;
}

@Injectable({ providedIn: 'root' })
export class SnapshotService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/snapshots';

  getAll(): Observable<SnapshotSummary[]> {
    return this.http.get<SnapshotSummary[]>(this.base);
  }

  getPositions(snapshotId: string): Observable<SnapshotPosition[]> {
    return this.http.get<SnapshotPosition[]>(`${this.base}/${snapshotId}/positions`);
  }
}
