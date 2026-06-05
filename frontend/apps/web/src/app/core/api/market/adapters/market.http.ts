import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import {
  ChartResponse,
  MarketRepository,
  SectorBenchmark,
  SymbolMatch,
  TickerNarrativeJob,
  TickerNarrativeSnapshot,
  TickerSnapshot,
  TimeframeCode,
} from '../market.repository';

@Injectable()
export class HttpMarketRepository extends MarketRepository {
  private readonly http = inject(HttpClient);

  getTicker(symbol: string): Observable<TickerSnapshot> {
    return this.http.get<TickerSnapshot>(`/api/market/ticker/${encodeURIComponent(symbol)}`);
  }

  searchSymbols(query: string, limit = 10): Observable<SymbolMatch[]> {
    return this.http.get<SymbolMatch[]>(`/api/market/symbols/search`, {
      params: { q: query, limit: String(limit) },
    });
  }

  getChart(symbol: string, timeframe: TimeframeCode): Observable<ChartResponse> {
    return this.http.get<ChartResponse>(`/api/market/ticker/${encodeURIComponent(symbol)}/chart`, {
      params: { timeframe },
    });
  }

  getSectorBenchmark(symbol: string): Observable<SectorBenchmark> {
    return this.http.get<SectorBenchmark>(
      `/api/market/ticker/${encodeURIComponent(symbol)}/sector-benchmark`,
    );
  }

  requestNarrative(symbol: string): Observable<TickerNarrativeJob> {
    return this.http.post<TickerNarrativeJob>(
      `/api/market/ticker/${encodeURIComponent(symbol)}/narrative`,
      {},
    );
  }

  getPendingNarrativeJob(symbol: string): Observable<TickerNarrativeJob | null> {
    // 404 = "no narrative job currently pending for this symbol" — a normal, expected state on
    // most dossier visits. Map to `null` so the page can simply branch on the value rather than
    // handle errors (mirror of `getLatestNarrative` below).
    return this.http
      .get<TickerNarrativeJob>(
        `/api/market/ticker/${encodeURIComponent(symbol)}/narrative/jobs/pending`,
      )
      .pipe(catchError((err) => (err.status === 404 ? of(null) : throwError(() => err))));
  }

  getLatestNarrative(symbol: string): Observable<TickerNarrativeSnapshot | null> {
    // 404 = "no snapshot yet for this symbol" — a normal, expected state on first visit.
    // Map it to `null` so the page can simply branch on the value rather than handle errors.
    return this.http
      .get<TickerNarrativeSnapshot>(
        `/api/market/ticker/${encodeURIComponent(symbol)}/narrative/latest`,
      )
      .pipe(catchError((err) => (err.status === 404 ? of(null) : throwError(() => err))));
  }
}
