import { Observable } from 'rxjs';

/**
 * Aggregated analyst view for a ticker, returned by the backend `analyst/` module. Provider-
 * agnostic on this side — today the backend hits Finnhub but the front sees a uniform shape.
 *
 * `priceTarget` is **explicitly null** (Jackson `Include.ALWAYS`) when the upstream `/price-target`
 * endpoint is unavailable for the symbol — distinct from "loading" or "error". The component
 * branches on `null` to hide the target line and keep the rest of the panel rendered.
 */
export interface AnalystSnapshot {
  symbol: string;
  /** ISO date (`YYYY-MM-DD`) of the most recent recommendation snapshot. */
  asOf: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  /** Sum of the five buckets — UI uses it to size the segmented bar proportions. */
  totalAnalysts: number;
  /** `BUY` / `HOLD` / `SELL` / `MIXED` — UI maps each to a coloured chip. */
  consensus: AnalystConsensus;
  priceTarget: AnalystPriceTarget | null;
  /** Up to 6 monthly snapshots, **oldest first** for natural left-to-right trend rendering. */
  history: MonthlyRecommendation[];
}

export type AnalystConsensus = 'BUY' | 'HOLD' | 'SELL' | 'MIXED';

export interface MonthlyRecommendation {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/**
 * 12-month forward price target consensus. Numbers are decimals serialised by the backend ; the
 * front displays them rounded to 2 decimals via the `number` pipe.
 */
export interface AnalystPriceTarget {
  high: number;
  low: number;
  mean: number;
  median: number;
  numberOfAnalysts: number;
}

/**
 * Port — read-only access to the analyst recommendations panel. Backed by the backend's routing
 * adapter (Finnhub or mock) ; provider switching happens server-side via `analyst.provider`.
 *
 * Errors :
 * - HTTP 404 when the symbol has no analyst coverage — front renders an empty state.
 * - HTTP 503 when the upstream is unavailable (Finnhub down / rate-limited / auth failed) —
 *   front renders an inline error banner scoped to the panel.
 */
export abstract class AnalystRepository {
  abstract getForSymbol(symbol: string): Observable<AnalystSnapshot>;
}
