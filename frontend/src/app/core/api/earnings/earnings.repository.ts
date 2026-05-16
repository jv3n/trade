import { Observable } from 'rxjs';

/**
 * Aggregated earnings view for a ticker, returned by the backend `earnings/` module. Provider-
 * agnostic on this side — today the backend hits Finnhub but the front sees a uniform shape.
 *
 * `nextEarningsDate` and `nextEarningsTime` are **explicitly null** (Jackson `Include.ALWAYS`) when
 * the upstream `/calendar/earnings` endpoint is unavailable for the symbol — distinct from
 * "loading" or "error". The component branches on `null` to hide the countdown line and keep the
 * report breakdown rendered.
 */
export interface EarningsSnapshot {
  symbol: string;
  /** ISO date (`YYYY-MM-DD`) of the next expected announcement. `null` when unknown. */
  nextEarningsDate: string | null;
  /** `BEFORE_MARKET` / `AFTER_MARKET` / `UNSPECIFIED` — UI maps to a small label. */
  nextEarningsTime: EarningsTime | null;
  /** Up to 4 quarterly reports, **oldest first** for natural left-to-right trend rendering. */
  lastReports: EarningsReport[];
}

export type EarningsTime = 'BEFORE_MARKET' | 'AFTER_MARKET' | 'UNSPECIFIED';

/**
 * One reported quarter — period (fiscal quarter end), the consensus EPS estimate, the actual
 * print, and the derived surprise %. Any of the three numeric fields can be `null` when the data
 * is missing for that quarter — the front collapses the row gracefully.
 */
export interface EarningsReport {
  period: string;
  epsEstimate: number | null;
  epsActual: number | null;
  /** `(actual − estimate) / |estimate| × 100`, rounded to 2 dp by the backend. */
  surprisePercent: number | null;
}

/**
 * Port — read-only access to the earnings panel. Backed by the backend's routing adapter (Finnhub
 * or mock) ; provider switching happens server-side via `earnings.provider`.
 *
 * Errors :
 * - HTTP 404 when the symbol has no earnings data — front renders an empty state.
 * - HTTP 503 when the upstream is unavailable (Finnhub down / rate-limited / auth failed) — front
 *   renders an inline error banner scoped to the panel.
 */
export abstract class EarningsRepository {
  abstract getForSymbol(symbol: string): Observable<EarningsSnapshot>;
}
