import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, interval, of, switchMap, takeWhile, throwError } from 'rxjs';
import {
  ChartResponse,
  MarketRepository,
  NarrativePromptPreview,
  SectorBenchmark,
  SymbolMatch,
  TickerNarrativeJob,
  TickerNarrativeSnapshot,
  TickerSnapshot,
  TimeframeCode,
} from '../market.repository';
import { LlmTimeoutService } from '../llm-timeout.service';

const NARRATIVE_POLL_INTERVAL_MS = 3000;

@Injectable()
export class HttpMarketRepository extends MarketRepository {
  private readonly http = inject(HttpClient);
  private readonly timeout = inject(LlmTimeoutService);

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

  pollNarrativeJob(symbol: string, jobId: string): Observable<TickerNarrativeJob> {
    const url = `/api/market/ticker/${encodeURIComponent(symbol)}/narrative/jobs/${encodeURIComponent(jobId)}`;
    return interval(NARRATIVE_POLL_INTERVAL_MS).pipe(
      switchMap(() =>
        this.http
          .get<TickerNarrativeJob>(url)
          .pipe(
            catchError((err) =>
              throwError(
                () =>
                  new Error(
                    err.status === 404
                      ? 'Job introuvable (backend redémarré ?)'
                      : `Erreur ${err.status}`,
                  ),
              ),
            ),
          ),
      ),
      takeWhile((job) => {
        if (job.status !== 'PENDING') return false;
        const ageSeconds = (Date.now() - new Date(job.createdAt).getTime()) / 1000;
        // Read the timeout per tick — see analysis.http.ts for the full rationale (slider drag
        // mid-poll takes effect on the next tick instead of being snapshotted at construction).
        if (ageSeconds > this.timeout.seconds())
          throw new Error('Génération du narratif trop longue — relance possible');
        return true;
      }, true),
    );
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

  getNarrativePromptPreview(symbol: string): Observable<NarrativePromptPreview> {
    return this.http.get<NarrativePromptPreview>(
      `/api/market/ticker/${encodeURIComponent(symbol)}/narrative/preview`,
    );
  }
}
