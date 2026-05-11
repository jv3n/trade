import { Observable } from 'rxjs';

/**
 * Wire shape returned by `PATCH /api/narrative/snapshots/{id}/thumbs`. Mirror of the backend
 * `PromptScoreDto` — the page consumes `snapshotId` + `userThumbs` to confirm what the server
 * persisted, the rest is forward-compat with the PR6 stats page (it'll consume the same DTO).
 */
export interface PromptScore {
  id: string;
  snapshotId: string | null;
  promptTemplateId: string;
  latencyMs: number;
  retryCount: number;
  parseFailed: boolean;
  validatorFailed: boolean;
  userThumbs: number;
  llmJudgeScore: number | null;
  createdAt: string;
}

/**
 * Port — write-only access to the user feedback (👍 / 👎 / neutral) layered on top of a
 * narrative snapshot. Phase 3 PR5.
 *
 * **Why a dedicated repository** : the existing `MarketRepository` already groups every read on
 * a ticker (quote, chart, narrative, news…). Adding a *write* on a sibling table (`prompt_score`
 * lives next to `ticker_narrative_snapshot`) would mix the read aggregation surface with a
 * mutation on an unrelated entity — a small repo keeps the boundaries clean and forward-compat
 * with PR6 (the stats reads will land here too).
 *
 * **Allowed values** : `-1` (👎), `0` (neutral / reset), `+1` (👍). Backend enforces the same
 * range via a DB CHECK constraint, but the frontend should also guard against typos at the
 * call site.
 */
export abstract class NarrativeFeedbackRepository {
  abstract setThumbs(snapshotId: string, value: -1 | 0 | 1): Observable<PromptScore>;
}
