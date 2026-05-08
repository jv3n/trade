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

/**
 * Aggregated view of a ticker across all portfolios — used by the dashboard sidebar to provide a
 * flat clickable shortcut to the dossier (`/ticker/<symbol>`). `portfolioCount` is informational :
 * a ticker held in both CELI and REER shows `2`.
 */
export interface OwnedTicker {
  ticker: string;
  name: string;
  /** Bucket from `AssetType` (portfolio side) — `STOCK / ETF / CRYPTO / BOND / COMMODITY`.
   *  Drives the coloured chip rendered next to the symbol in the dashboard sidebar's "Tickers
   *  détenus" list. */
  assetType: AssetType;
  portfolioCount: number;
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
  /** Positions present before the import but absent from the new CSV — flipped to CLOSED. */
  positionsClosed: number;
  /** Previously CLOSED positions that reappear in the new CSV — flipped back to OPEN. */
  positionsReopened: number;
}

/**
 * Port — contract the application depends on. Components inject this abstraction;
 * the concrete HTTP implementation is wired in `core/providers.ts`.
 */
export abstract class PortfolioRepository {
  abstract getAll(): Observable<Portfolio[]>;
  abstract getById(id: string): Observable<Portfolio>;
  abstract getAssets(portfolioId: string): Observable<Asset[]>;
  /** Distinct tickers across all portfolios — single aggregated query, no client-side dedup. */
  abstract getOwnedTickers(): Observable<OwnedTicker[]>;
  abstract previewCsvImport(file: File): Observable<CsvImportPreview>;
  abstract confirmCsvImport(file: File): Observable<CsvImportResult>;
}
