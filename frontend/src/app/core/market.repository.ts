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
  /** `STOCK` / `ETF` / `INDEX` / `OTHER` / `null`. Drives type-conditional UI affordances —
   *  notably the Sector benchmark toggle which only makes sense for individual stocks. */
  instrumentType: 'STOCK' | 'ETF' | 'INDEX' | 'OTHER' | null;
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

// ---- Narrative pipeline ----

export type Sentiment = 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export type NarrativeJobStatus = 'PENDING' | 'DONE' | 'ERROR';

export interface TickerNarrativeJob {
  jobId: string;
  symbol: string;
  status: NarrativeJobStatus;
  createdAt: string;
  snapshotId: string | null;
  error: string | null;
}

export interface TickerNarrativeSnapshot {
  id: string;
  symbol: string;
  generatedAt: string;
  price: number;
  summary: string;
  sentiment: Sentiment;
  keyPoints: string[];
  modelUsed: string;
  promptVersion: string;
  /**
   * FK to the active `prompt_template` row that generated this snapshot. `null` means the
   * fallback prompt path was taken (no `prompt_score` row exists) — the dossier ticker uses
   * this to hide the 👍/👎 buttons rather than letting the user click into a 404 (Phase 3 PR5).
   */
  promptTemplateId: string | null;
}

// ---- Multi-timeframe chart ----

/**
 * Frontend-side mirror of the backend `Timeframe` enum. Codes are stable strings — the backend
 * whitelist returns 400 on unknown values, so adding a new entry here without backend support
 * would silently break the toggle.
 */
export type TimeframeCode = '1d' | '5d' | '1mo' | '3mo' | '1y' | '5y';

export const TIMEFRAME_CODES: TimeframeCode[] = ['1d', '5d', '1mo', '3mo', '1y', '5y'];

/**
 * Response from the chart endpoint. Echoes back the resolved range / interval used upstream so
 * the front can verify the cache hit it expected (debugging only — not displayed to the user).
 */
export interface ChartResponse {
  symbol: string;
  timeframe: TimeframeCode;
  range: string;
  interval: string;
  bars: OhlcBar[];
}

/**
 * One result from `/api/market/symbols/search`. Drives the watchlist autocomplete dropdown — the
 * `symbol` is the canonical ticker (uppercase, with exchange suffix when relevant : `RY.TO`), the
 * `name` is the issuer label, the `exchange` disambiguates dual-listed tickers in the dropdown.
 */
export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
}

/**
 * Resolved sector benchmark for a ticker — returned by `/api/market/ticker/{symbol}/sector-benchmark`.
 * The frontend then re-uses the regular chart endpoint with [etfSymbol] to fetch the bars and
 * displays `<sector> (<etfSymbol>)` in the chart legend (e.g. "Technology (XLK)").
 */
export interface SectorBenchmark {
  tickerSymbol: string;
  sector: string;
  etfSymbol: string;
  etfName: string;
}

/**
 * Port — read-only access to ticker market data, computed indicators and LLM narrative.
 * Backed by Twelve Data + Claude/Ollama via the backend `market/` and `analysis/` modules.
 */
export abstract class MarketRepository {
  abstract getTicker(symbol: string): Observable<TickerSnapshot>;

  /**
   * Search the configured market provider for symbols matching [query]. Returns up to [limit]
   * suggestions ordered by upstream relevance. An empty / blank query short-circuits to `[]` server
   * side, so the typeahead can call this on every keystroke without hammering the upstream.
   */
  abstract searchSymbols(query: string, limit?: number): Observable<SymbolMatch[]>;

  /**
   * Bars-only fetch for the multi-timeframe chart toggle. Doesn't recompute indicators or
   * re-prompt the LLM — those stay anchored to the dossier's 1Y reference view (served by
   * [getTicker]). 400 if the timeframe code is unknown (defensive whitelist server-side).
   */
  abstract getChart(symbol: string, timeframe: TimeframeCode): Observable<ChartResponse>;

  /**
   * Resolves [symbol] to its SPDR sector ETF for the chart benchmark overlay. 404 surfaces both
   * "symbol unknown" and "sector outside the SPDR mapping" — the UI handles both as "no sector
   * benchmark available". 503 propagates the usual `MarketUnavailableException`.
   */
  abstract getSectorBenchmark(symbol: string): Observable<SectorBenchmark>;

  /**
   * Kick off (or reuse, if cached) a narrative generation for [symbol]. The returned job may
   * already be `DONE` if a fresh snapshot existed (≤ 30 min old) or if a sibling job was pending
   * (≤ 5 min). The frontend must check `status` before deciding whether to open a stream.
   *
   * For pending jobs, subscribe to per-phase updates via [JobStreamService.streamNarrativeJob]
   * — replaces the legacy 3-second poll on `GET /jobs/{id}`.
   */
  abstract requestNarrative(symbol: string): Observable<TickerNarrativeJob>;

  /**
   * Currently pending job for [symbol] within the dedup window, or `null` if none. Used by the
   * dossier on init to reattach to a running SSE stream after a navigate-away → return-to-page
   * round trip. 404 from the backend (no pending job) maps to `null` rather than an error so the
   * caller can simply branch on the value.
   */
  abstract getPendingNarrativeJob(symbol: string): Observable<TickerNarrativeJob | null>;

  /** Latest snapshot for a symbol, or `null` when none exists yet (404 → null). */
  abstract getLatestNarrative(symbol: string): Observable<TickerNarrativeSnapshot | null>;
}
