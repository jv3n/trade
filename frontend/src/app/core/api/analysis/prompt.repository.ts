import { Observable } from 'rxjs';

/**
 * Wire shape of one row in `prompt_template` (Flyway V8). Mirror of the backend DTO
 * `PromptTemplateDto`. The page `/settings/prompts` consumes a list of these to render the
 * version table, and a single one when the user expands a row to see the system prompt body.
 *
 * `isActive` drives the chip + the « Activate » button visibility. `activatedAt` and
 * `deprecatedAt` are nullable on rows that have never been activated yet, or are still active.
 */
export interface PromptTemplate {
  id: string;
  name: string;
  version: string;
  systemPrompt: string;
  userTemplate: string | null;
  targetModel: string | null;
  isActive: boolean;
  createdAt: string;
  activatedAt: string | null;
  deprecatedAt: string | null;
  notes: string | null;
}

/**
 * Port — read + activate access to the narrative prompts persisted in the backend. Phase 3 PR3
 * lands the list / view / activate surface ; PR4 extends with create + edit, PR5/PR6 layer the
 * feedback loop and stats on top of `prompt_score` (read-only via separate endpoint).
 *
 * `activate(id)` is idempotent server-side : activating an already-active row is a no-op (returns
 * the row unchanged). A non-existent id surfaces as a 404 — the optimistic UI rolls back the
 * local state in that case.
 */
/**
 * Aggregated scoring stats for one prompt — Phase 3 PR6 backing the `/settings/prompts/{id}/stats`
 * page. Empty contract : `totalRuns: 0` + null percentiles + empty `daily` means no `prompt_score`
 * row exists yet (the page renders an empty state pointing at the next narrative run).
 */
export interface PromptStats {
  promptTemplateId: string;
  totalRuns: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  retryRate: number;
  parseFailedRate: number;
  validatorFailedRate: number;
  thumbs: { up: number; down: number; neutral: number };
  daily: DailyBucket[];
}

/** One day of aggregates — used by the page to render the sparklines. */
export interface DailyBucket {
  day: string; // `YYYY-MM-DD`
  runs: number;
  latencyP50Ms: number | null;
  thumbsUp: number;
  thumbsDown: number;
}

/**
 * Body of `POST /api/prompts`. Mirror of the backend `CreatePromptInput` DTO. The created row
 * always lands `isActive = false` server-side ; chaining create + activate is a UX choice on the
 * frontend, not an API coupling.
 */
export interface CreatePromptInput {
  name: string;
  version: string;
  systemPrompt: string;
  userTemplate?: string | null;
  targetModel?: string | null;
  notes?: string | null;
}

/**
 * Read-only view of the immutable technical envelope appended after the editable body when the
 * narrative prompt is assembled. The `/settings/prompts` page renders [suffix] in a collapsible
 * panel so the user sees exactly what the LLM receives around their body — without being able to
 * edit it. [version] mirrors the backend's `NARRATIVE_PROMPT_VERSION`.
 */
export interface PromptEnvelope {
  version: string;
  suffix: string;
}

export abstract class PromptRepository {
  abstract list(name?: string): Observable<PromptTemplate[]>;
  abstract get(id: string): Observable<PromptTemplate>;
  abstract activate(id: string): Observable<PromptTemplate>;
  abstract create(input: CreatePromptInput): Observable<PromptTemplate>;
  abstract getStats(id: string): Observable<PromptStats>;
  abstract getEnvelope(): Observable<PromptEnvelope>;
}
