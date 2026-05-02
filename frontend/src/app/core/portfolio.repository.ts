import { Observable } from 'rxjs';

export type AssetType = 'ETF' | 'STOCK' | 'COMMODITY' | 'CRYPTO' | 'BOND';

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  /** Sum of bookValueCad across the portfolio's assets, in CAD. Comparable cross-portfolio. */
  totalBookValueCad: number;
}

export interface Asset {
  id: string;
  portfolioId: string;
  ticker: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  assetType: AssetType;
  /** Devise native (USD, CAD…) */
  currency: string;
  /** Valeur comptable en CAD */
  bookValueCad: number;
  /** Valeur marchande actuelle en devise native */
  marketValue: number;
  /** Prix de marché unitaire */
  marketPrice: number;
  /** Rendements non réalisés du marché */
  unrealizedGain: number | null;
  gainCurrency: string | null;
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

/**
 * Port — contract the application depends on. Components inject this abstraction;
 * the concrete HTTP implementation is wired in `app.config.ts`.
 */
export abstract class PortfolioRepository {
  abstract getAll(): Observable<Portfolio[]>;
  abstract getById(id: string): Observable<Portfolio>;
  abstract getAssets(portfolioId: string): Observable<Asset[]>;
  abstract previewCsvImport(file: File): Observable<CsvImportPreview>;
  abstract confirmCsvImport(file: File): Observable<CsvImportResult>;
}
