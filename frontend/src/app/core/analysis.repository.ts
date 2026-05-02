import { Observable } from 'rxjs';

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
 * Port — analysis-related data access. The HTTP polling helper [pollJob] lives here too:
 * it's still data access (just async/repeated), and keeping it on the port avoids splitting
 * the orchestration across two abstractions for the rudimentary first pass.
 */
export abstract class AnalysisRepository {
  abstract startAnalysis(portfolioId: string): Observable<AnalysisJob>;
  abstract pollJob(portfolioId: string, jobId: string): Observable<AnalysisJob>;
  abstract getRecommendation(
    portfolioId: string,
    recommendationId: string,
  ): Observable<Recommendation>;
  abstract getRecommendations(portfolioId: string): Observable<Recommendation[]>;
  abstract getAllRecommendations(): Observable<Recommendation[]>;
  abstract getPromptPreview(portfolioId: string): Observable<PromptPreview>;
}
