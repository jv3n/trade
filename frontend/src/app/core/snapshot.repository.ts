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

export abstract class SnapshotRepository {
  abstract getAll(): Observable<SnapshotSummary[]>;
  abstract getPositions(snapshotId: string): Observable<SnapshotPosition[]>;
}
