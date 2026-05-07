import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, catchError, throwError } from 'rxjs';
import {
  AnalysisRepository,
  AnalysisJob,
  Recommendation,
  PromptPreview,
} from '../analysis.repository';

/**
 * Hard cap before the frontend gives up polling. Aligned at 400 s with the OllamaClient backend
 * read timeout and the Phase 0 dedup window (single source of truth for « how long can a portfolio
 * analysis take »). The previous design budgeted 2 × Ollama read (2 × 180 s) within this window
 * to fit a validator retry ; the OllamaClient timeout was bumped to 400 s on 2026-05-07 so the
 * retry now fits only when the first attempt failed fast (parse error, not timeout) — acceptable
 * because Phase 0 is frozen and validator failures are dominated by parse errors which are
 * near-instant. Claude is much faster ; 400 s covers both providers. Keep aligned with backend
 * DEDUP_WINDOW_SECONDS.
 */
const POLL_ABORT_SECONDS = 400;

@Injectable()
export class HttpAnalysisRepository extends AnalysisRepository {
  private readonly http = inject(HttpClient);

  startAnalysis(portfolioId: string): Observable<AnalysisJob> {
    return this.http.post<AnalysisJob>(`/api/portfolios/${portfolioId}/recommendations`, {});
  }

  pollJob(portfolioId: string, jobId: string): Observable<AnalysisJob> {
    return interval(5000).pipe(
      switchMap(() =>
        this.http
          .get<AnalysisJob>(`/api/portfolios/${portfolioId}/recommendations/jobs/${jobId}`)
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
        if (ageSeconds > POLL_ABORT_SECONDS)
          throw new Error('Analyse trop longue — relance possible');
        return true;
      }, true),
    );
  }

  getRecommendation(portfolioId: string, recommendationId: string): Observable<Recommendation> {
    return this.http.get<Recommendation>(
      `/api/portfolios/${portfolioId}/recommendations/${recommendationId}`,
    );
  }

  getRecommendations(portfolioId: string): Observable<Recommendation[]> {
    return this.http.get<Recommendation[]>(`/api/portfolios/${portfolioId}/recommendations`);
  }

  getAllRecommendations(): Observable<Recommendation[]> {
    return this.http.get<Recommendation[]>('/api/recommendations');
  }

  getPromptPreview(portfolioId: string): Observable<PromptPreview> {
    return this.http.get<PromptPreview>(`/api/portfolios/${portfolioId}/recommendations/preview`);
  }
}
