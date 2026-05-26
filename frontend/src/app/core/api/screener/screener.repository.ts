import { Observable } from 'rxjs';

/**
 * One row of the market radar — a ticker showing an abnormal move at the open. Provider-agnostic
 * shape, mirrors the backend `TickerMoverDto`. Numeric fields are decimals serialised by the
 * backend ; the template formats them via the `number` pipe (gap / volume ratio shown with 1
 * decimal, prices with 2, volumes / market cap as integers).
 *
 * `gapPct` is **signed** : positive = gap-up (the open price gapped above yesterday's close,
 * pump-precursor case), negative = gap-down. v1 defaults filter for gap-up only ; a future
 * « gap-down » preset would relax the floor to a negative value.
 *
 * `sector` is nullable because some adapters / symbols don't carry sector metadata — the table
 * renders a `—` placeholder in that case.
 */
export interface TickerMover {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  gapPct: number;
  volume: number;
  volumeAvg30d: number;
  volumeRatio: number;
  marketCapUsd: number;
  exchange: string;
  sector: string | null;
}

/**
 * Dynamic, user-editable thresholds applied to the universe snapshot. Mirrors the backend
 * `ScreenerFilter` shape — every field is serialised as a query param when present, defaults
 * mirror the Phase 6 kick-off decision (gap≥5 %, volume≥3×, no cap/exchange/sector narrowing).
 *
 * `gapPctMin` is **directional** — positive value filters gap-up only, negative value lets
 * gap-down rows through. v1 stays positive ; the field is signed so a future preset can flip it.
 */
export interface ScreenerFilter {
  gapPctMin: number;
  volumeRatioMin: number;
  marketCapMin: number | null;
  marketCapMax: number | null;
  exchange: string | null;
  sector: string | null;
}

/** Default thresholds — match the backend `ScreenerFilter.DEFAULT`. */
export const DEFAULT_SCREENER_FILTER: ScreenerFilter = {
  gapPctMin: 5,
  volumeRatioMin: 3,
  marketCapMin: null,
  marketCapMax: null,
  exchange: null,
  sector: null,
};

/**
 * Port — read-only access to the market radar. Backed by the backend `screener/` module ; the
 * upstream provider (mock today, Polygon-or-equivalent later) is opaque to the front.
 *
 * Errors :
 * - HTTP 503 when the upstream provider is unavailable — the page renders an inline error
 *   banner with a retry hint.
 * - **Empty list (200 OK with `[]`) is a valid state** — "no abnormal move detected right now".
 *   The page renders an empty-state hint, not an error.
 */
export abstract class ScreenerRepository {
  abstract findMovers(filter: ScreenerFilter): Observable<TickerMover[]>;
}
