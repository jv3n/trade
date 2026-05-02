import { Observable } from 'rxjs';

export interface TickerQuote {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  price: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  asOf: string;
}

export interface Indicators {
  asOf: string;
  price: number;
  rsi14: number | null;
  ma50: number | null;
  ma200: number | null;
  momentum30d: number | null;
  momentum90d: number | null;
  perf1m: number | null;
  perf3m: number | null;
  perf1y: number | null;
  drawdownFrom52wHigh: number | null;
  volumeRelative30d: number | null;
  distanceToMa50Pct: number | null;
  distanceToMa200Pct: number | null;
}

export interface OhlcBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerSnapshot {
  quote: TickerQuote;
  indicators: Indicators | null;
  bars: OhlcBar[];
}

/**
 * Port — read-only access to ticker market data and computed indicators.
 * Backed by Yahoo Finance via the backend `market/` module.
 */
export abstract class MarketRepository {
  abstract getTicker(symbol: string): Observable<TickerSnapshot>;
}
