import { Pattern } from '../shared/pattern.model';

/**
 * Candidates **domain** types — the morning capture of a ticker spotted on the radar, with what is
 * known in premarket only (cf. `mockup/PARCOURS.md › Étape 1`). The wire format (ISO date strings)
 * is owned by the HTTP adapter ; consumers stay in `Date` land.
 *
 * Only the captured fields live here : gap %, push % and locate / price are derived by
 * `features/candidates/candidates.math`, never stored. Float and volume are in **millions** of
 * shares, the locate in $ / share. One candidate per (day, ticker) — a duplicate is a 409.
 */
export interface Candidate {
  id: string;
  /** Session the candidate was captured for — the page browses one day at a time. */
  tradingDate: Date;
  pattern: Pattern;
  ticker: string;
  /** Previous session's close (daily candle). */
  previousClose: number;
  /** First premarket print, at 4:00 am. */
  pmOpen: number;
  pmHigh: number;
  floatMillions: number | null;
  /** TradeZero volume at capture time. */
  volumeMillions: number | null;
  locatePerShare: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Create / update payload — [Candidate] minus the server-owned id + audit fields. */
export type CandidateInput = Omit<Candidate, 'id' | 'createdAt' | 'updatedAt'>;
