import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, interval, of, switchMap, takeWhile, throwError } from 'rxjs';
import {
  MarketRepository,
  NarrativePromptPreview,
  TickerNarrativeJob,
  TickerNarrativeSnapshot,
  TickerSnapshot,
} from '../market.repository';

/**
 * Hard cap before the frontend gives up polling a narrative job. Aligned with the backend's
 * `TickerNarrativeJobStore.DEDUP_WINDOW_SECONDS = 300` so a stuck job won't be returned by dedup
 * to a polling frontend that already gave up.
 *
 * Claude resolves in 1-3 s, Ollama (Mistral 7B on M1) in 30-60 s. 300 s covers both with margin.
 */
const NARRATIVE_POLL_ABORT_SECONDS = 300;
const NARRATIVE_POLL_INTERVAL_MS = 3000;

@Injectable()
export class HttpMarketRepository extends MarketRepository {
  private readonly http = inject(HttpClient);

  getTicker(symbol: string): Observable<TickerSnapshot> {
    return this.http.get<TickerSnapshot>(`/api/market/ticker/${encodeURIComponent(symbol)}`);
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
        if (ageSeconds > NARRATIVE_POLL_ABORT_SECONDS)
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
