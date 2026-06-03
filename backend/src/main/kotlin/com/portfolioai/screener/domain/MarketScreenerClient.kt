package com.portfolioai.screener.domain

/**
 * Outbound port for the market radar (Phase 6). Returns the **full snapshot** of tickers within a
 * [ScreenerUniverse] — pre-filtering on the universe bounds happens here, in the adapter, because
 * paid providers (Polygon, Finnhub) bill per call and you'd rather have the API constrain by
 * exchange + cap range upstream than pull the whole US market every refresh.
 *
 * **The dynamic user filter is NOT this port's concern** — gap % / volume ratio thresholds are
 * applied **client-side** on the persisted snapshot (Phase 6 ticket (9), 2026-05-29). The adapter
 * focuses on "what slice of the market", the persisted snapshot carries the raw movers, the
 * frontend's `applyScreenerFilter` narrows the view at zero HTTP cost per tweak.
 *
 * Failure contract :
 * - **Upstream blip** (rate-limit, 5xx, network, auth) → throw
 *   [com.portfolioai.shared.UpstreamUnavailableException]. The `GlobalExceptionHandler` maps that
 *   to HTTP 503 ; the front shows an inline error on the radar without breaking the rest of the
 *   app.
 * - **Empty snapshot** (universe has no matching ticker right now — possible if markets are closed,
 *   or if a tight universe simply has no mover) → return an empty list, **not** an exception. Empty
 *   is a valid state — the radar renders an empty table with a hint ("no abnormal move detected at
 *   this time").
 *
 * The active adapter in Sprint 1 is the mock only. Sprint 2 will introduce a real provider (Polygon
 * lead candidate) behind a `RoutingMarketScreenerClient`, mirroring the pattern used by
 * `RoutingNewsClient` / `RoutingAnalystClient` / `RoutingEarningsClient`.
 */
interface MarketScreenerClient {
  fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover>
}
