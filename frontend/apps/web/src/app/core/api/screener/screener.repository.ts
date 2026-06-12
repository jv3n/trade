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
  /** Free-float shares (3M–50M is the GUS target). `null` when the provider doesn't expose it. */
  floatShares: number | null;
  /** Premarket session volume (shares). `null` when the provider doesn't expose it. */
  premarketVolume: number | null;
}

/**
 * The GUS entry checklist as machine-checkable thresholds (cf. `docs/TTD/analyse-company/
 * check-company.md`). **Price + gap only** — price $1–$10, gap ≥ +50 %. The float axis was dropped :
 * the only free source (FMP `shares-float`) is stale on the dilution-heavy small-caps the radar
 * targets (e.g. GELS read 3.6M vs 5.62M on DilutionTracker), so showing/filtering on it was
 * misleading. Float, chart trend, company quality and reverse-split detection are evaluated
 * externally by the user (the radar links out to DilutionTracker per row).
 */
export const GUS_CRITERIA = {
  priceMin: 1,
  priceMax: 10,
  gapPctMin: 50,
} as const;

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
 * GUS checklist filter — keeps only the tickers that clear the machine-checkable entry criteria
 * (price $1–$10, gap ≥ +50 %), sorted by gap descending. Lives next to the port so the contract and
 * the predicate stay in sync. Float is no longer part of the filter (see [GUS_CRITERIA]).
 */
export function applyGusChecklist(rows: TickerMover[]): TickerMover[] {
  return rows
    .filter(
      (row) =>
        row.price >= GUS_CRITERIA.priceMin &&
        row.price <= GUS_CRITERIA.priceMax &&
        row.gapPct >= GUS_CRITERIA.gapPctMin,
    )
    .sort((a, b) => b.gapPct - a.gapPct);
}
