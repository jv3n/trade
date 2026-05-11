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
export abstract class PromptRepository {
  abstract list(name?: string): Observable<PromptTemplate[]>;
  abstract get(id: string): Observable<PromptTemplate>;
  abstract activate(id: string): Observable<PromptTemplate>;
}
