/**
 * Candidates **domain** types — the persisted backing of the short-trade preparation cockpit,
 * consumed by the candidates feature and the repository port. The wire format (ISO date strings) is
 * owned by the HTTP adapter ; consumers stay in `Date` land.
 *
 * Only the saved **inputs** live here. The cockpit's derived figures (entry ladder, execution
 * totals, residual risk, cover gains, GUS / borrow %) are computed client-side by `candidates.math`,
 * never stored. Percentages are whole numbers (`5` = 5 %, `40` = 40 %).
 */

/** Shares actually short at an entry-ladder rung. `step` is a fraction of the open (`0.35` = +35 %). */
export interface CandidateFill {
  step: number;
  sharesInPlay: number;
}

/** A free-form short entry leg : `sharesInPlay` shares actually shorted at `entryPrice` (not bound to a fixed rung). */
export interface CandidateEntry {
  entryPrice: number;
  sharesInPlay: number;
}

/** A planned / executed cover leg : buy-to-close `sharesCovered` shares at `exitPrice`. */
export interface CandidateExit {
  exitPrice: number;
  sharesCovered: number;
}

export interface Candidate {
  id: string;
  /** Session date — drives dropdown visibility (today = active, past = closed). */
  tradingDate: Date;
  ticker: string;
  totalCapital: number;
  pctCapitalAtRisk: number;
  openPrice: number;
  stopPct: number | null;
  previousClose: number | null;
  floatShares: number | null;
  volume: number | null;
  morningPush: number | null;
  borrowCostPerShare: number | null;
  fills: CandidateFill[];
  entries: CandidateEntry[];
  exits: CandidateExit[];
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Create / re-save payload. Same shape as [Candidate] minus the server-owned id + audit fields. */
export interface CandidateInput {
  tradingDate: Date;
  ticker: string;
  totalCapital: number;
  pctCapitalAtRisk: number;
  openPrice: number;
  stopPct: number | null;
  previousClose: number | null;
  floatShares: number | null;
  volume: number | null;
  morningPush: number | null;
  borrowCostPerShare: number | null;
  fills: CandidateFill[];
  entries: CandidateEntry[];
  exits: CandidateExit[];
  note: string | null;
}
