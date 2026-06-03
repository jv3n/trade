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
 * Dynamic, user-editable thresholds applied client-side to the persisted snapshot. Two axes since
 * Phase 6 ticket (8) v0.5 simplified the panel : exchange + market-cap range are now enforced at
 * the backend universe level ([ScreenerUniverse.NASDAQ_MID_CAP]) and sector was no-op on every
 * live provider (FMP / Polygon don't carry it).
 *
 * `gapPctMin` is **directional** — positive value filters gap-up only, negative value lets
 * gap-down rows through. v1 stays positive ; the field is signed so a future preset can flip it.
 * `volumeRatioMin` is no-op on FMP (volume not exposed by the gainers/losers endpoint) but used on
 * Mock + Polygon ; the user can drop it to 0 when running with FMP.
 */
export interface ScreenerFilter {
  gapPctMin: number;
  volumeRatioMin: number;
}

/**
 * Default thresholds — `gapPctMin = 10` matches the Phase 6 ticket (8) re-targeting (focus on
 * **truly** abnormal moves, drop the 5 % noise floor inherited from Sprint 1).
 */
export const DEFAULT_SCREENER_FILTER: ScreenerFilter = {
  gapPctMin: 10,
  volumeRatioMin: 3,
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
 * Pure client-side filter — gap floor + volume ratio floor + sort by `gapPct` descending. Lives
 * next to the port so the contract and the predicate stay in sync. `gapPctMin` is directional (cf.
 * [TickerMover.gapPct] doc).
 *
 * **`volumeRatio === 0` is treated as a sentinel meaning "provider doesn't expose volume"** and
 * passes through regardless of [ScreenerFilter.volumeRatioMin]. Without this, FMP-sourced movers
 * (which all carry `volumeRatio = 0` because the gainers/losers endpoint doesn't expose volume)
 * would be silently filtered out by any positive volume floor — the radar would render empty even
 * though the snapshot has data. Mock + Polygon compute a real volumeRatio so the floor still
 * applies to them.
 */
export function applyScreenerFilter(rows: TickerMover[], filter: ScreenerFilter): TickerMover[] {
  return rows
    .filter(
      (row) =>
        row.gapPct >= filter.gapPctMin &&
        (row.volumeRatio === 0 || row.volumeRatio >= filter.volumeRatioMin),
    )
    .sort((a, b) => b.gapPct - a.gapPct);
}
