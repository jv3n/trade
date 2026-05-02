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
  createdAt: string;
  recommendationId: string | null;
  error: string | null;
}

export interface PromptPreview {
  portfolioId: string;
  portfolioName: string;
  tickers: string[];
  systemPrompt: string;
  userMessage: string;
  systemPromptChars: number;
  userMessageChars: number;
}

/**
 * Hard cap before the frontend gives up polling. Must cover the worst case of two Mistral
 * attempts on M1 (validator retry): 2 × OllamaClient read timeout (180 s) + margin → 400 s.
 * Claude is much faster; 400 s covers both. Keep aligned with backend DEDUP_WINDOW_SECONDS.
 */
const POLL_ABORT_SECONDS = 400;

@Injectable({ providedIn: 'root' })
export class AnalysisService {
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
