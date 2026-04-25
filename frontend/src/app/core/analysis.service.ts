import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, catchError, throwError } from 'rxjs';

export type RecommendationAction = 'BUY' | 'SELL' | 'HOLD' | 'REDUCE';
export type RecommendationStatus = 'PENDING' | 'APPLIED' | 'IGNORED' | 'EVALUATED';
export type JobStatus = 'PENDING' | 'DONE' | 'ERROR';

export interface RecommendationActionItem {
  ticker: string;
  action: RecommendationAction;
  rationale: string | null;
  targetWeight: number | null;
}

export interface Recommendation {
  id: string;
  portfolioId: string;
  portfolioName: string;
  generatedAt: string;
  contextSummary: string;
  promptVersion: string;
  content: string;
  confidence: number | null;
  status: RecommendationStatus;
  actions: RecommendationActionItem[];
}

export interface AnalysisJob {
  jobId: string;
  status: JobStatus;
  recommendationId: string | null;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly http = inject(HttpClient);

  startAnalysis(portfolioId: string): Observable<AnalysisJob> {
    return this.http.post<AnalysisJob>(`/api/portfolios/${portfolioId}/recommendations`, {});
  }

  pollJob(portfolioId: string, jobId: string): Observable<AnalysisJob> {
    return interval(2000).pipe(
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
      takeWhile((job) => job.status === 'PENDING', true),
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
}
