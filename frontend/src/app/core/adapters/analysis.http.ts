import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, catchError, throwError } from 'rxjs';
import {
  AnalysisRepository,
  AnalysisJob,
  Recommendation,
  PromptPreview,
} from '../analysis.repository';
import { LlmTimeoutService } from '../llm-timeout.service';

@Injectable()
export class HttpAnalysisRepository extends AnalysisRepository {
  private readonly http = inject(HttpClient);
  private readonly timeout = inject(LlmTimeoutService);

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
        // Read the timeout per tick rather than at observable construction time : a slider drag
        // mid-poll then takes effect on the next tick instead of carrying the boot-time value
        // forward for the full poll lifetime.
        if (ageSeconds > this.timeout.seconds())
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
