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
}

/**
 * Port — read-only access to ticker market data, computed indicators and LLM narrative.
 * Backed by Yahoo Finance + Claude/Ollama via the backend `market/` and `analysis/` modules.
 */
export abstract class MarketRepository {
  abstract getTicker(symbol: string): Observable<TickerSnapshot>;

  /**
   * Kick off (or reuse, if cached) a narrative generation for [symbol]. The returned job may
   * already be `DONE` if a fresh snapshot existed (≤ 30 min old) or if a sibling job was pending
   * (≤ 5 min). The frontend must check `status` before deciding whether to poll.
   */
  abstract requestNarrative(symbol: string): Observable<TickerNarrativeJob>;

  /** Poll a narrative job every few seconds until it leaves the `PENDING` state. */
  abstract pollNarrativeJob(symbol: string, jobId: string): Observable<TickerNarrativeJob>;

  /** Latest snapshot for a symbol, or `null` when none exists yet (404 → null). */
  abstract getLatestNarrative(symbol: string): Observable<TickerNarrativeSnapshot | null>;
}
