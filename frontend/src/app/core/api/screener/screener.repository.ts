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
 * Dynamic, user-editable thresholds applied client-side to the persisted snapshot. Mirrors the
 * backend `ScreenerFilter` shape — kept identical so a future move back to server-side filtering
 * doesn't need a contract change.
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
 * Envelope returned by both `POST /api/screener/refresh` and `GET /api/screener/movers`. The
 * radar UI reads `fetchedAt === null` as the "no snapshot yet — press Rechercher to amorcer"
 * empty state, distinct from "snapshot exists but the filter matches nothing".
 *
 * `date` is an ISO-8601 calendar date (`YYYY-MM-DD`, ET market day) ; `fetchedAt` is an ISO-8601
 * timestamp the UI formats via the locale-aware `date` pipe.
 */
export interface ScreenerSnapshotResponse {
  date: string | null;
  provider: string;
  fetchedAt: string | null;
  movers: TickerMover[];
}

/**
 * Port — two paths since Phase 6 ticket (9) introduced snapshot persistance :
 * - [refresh] triggers a live fetch on the active provider, persists the snapshot, returns it.
 *   The page exposes this behind the « Rechercher » button — the only quota-burning call.
 * - [loadSnapshot] reads the persisted snapshot for the active provider (optionally for a given
 *   day). Zero call to the provider → safe on every page load.
 *
 * Errors :
 * - HTTP 503 from [refresh] when the upstream provider is unavailable — the page renders an
 *   inline error banner with a retry hint, the previous snapshot stays visible.
 * - **Empty envelope (200 OK with `fetchedAt === null`) is a valid state** — no snapshot has been
 *   persisted yet for the active provider. The page renders the "press Rechercher" hint.
 */
export abstract class ScreenerRepository {
  abstract refresh(): Observable<ScreenerSnapshotResponse>;
  abstract loadSnapshot(date?: string | null): Observable<ScreenerSnapshotResponse>;
}

/**
 * Pure client-side filter — mirrors the backend `MarketScreenerService.matches()` predicate so the
 * panel tweaks operate locally without re-hitting the API. Lives next to the port so the contract
 * and the predicate stay in sync.
 *
 * `gapPctMin` is directional (cf. [TickerMover.gapPct] doc) ; `null` market-cap bounds are no-ops ;
 * `null` exchange / sector are no-ops (wildcard). A mover with `sector === null` cannot match a
 * non-null sector filter ("unknown — can't claim membership").
 */
export function applyScreenerFilter(rows: TickerMover[], filter: ScreenerFilter): TickerMover[] {
  return rows
    .filter(
      (row) =>
        row.gapPct >= filter.gapPctMin &&
        row.volumeRatio >= filter.volumeRatioMin &&
        (filter.marketCapMin === null || row.marketCapUsd >= filter.marketCapMin) &&
        (filter.marketCapMax === null || row.marketCapUsd <= filter.marketCapMax) &&
        (filter.exchange === null ||
          row.exchange.toLowerCase() === filter.exchange.toLowerCase()) &&
        (filter.sector === null || row.sector?.toLowerCase() === filter.sector.toLowerCase()),
    )
    .sort((a, b) => b.gapPct - a.gapPct);
}
