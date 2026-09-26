import { Pattern } from '../shared/pattern.model';

/**
 * Candidates **domain** types — the morning capture of a ticker spotted on the radar, with what is
 * known in premarket only (cf. `mockup/PARCOURS.md › Étape 1`). The wire format (ISO date strings)
 * is owned by the HTTP adapter ; consumers stay in `Date` land.
 *
 * Only the captured fields live here : gap %, push %, locate / price and the target price are
 * derived by `features/candidates/candidates.math`, never stored. Float and volume are in **millions** of
 * shares, the locate in $ / share. One candidate per (day, ticker) — a duplicate is a 409. It has no
 * pattern : the pattern is chosen when promoting, one stat per pattern.
 */
export interface Candidate {
  id: string;
  /** Session the candidate was captured for — the page browses one day at a time. */
  tradingDate: Date;
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
  /** Session open, typed at 9:30 — `null` until then. Carried over to the stat on promotion. */
  openPrice: number | null;
  /** Push aimed at, in % above the open — `null` follows the reference picked on the card. */
  targetPushPercent: number | null;
  /**
   * The stats it became, one per pattern, in the order of the patterns — empty until promoted. Each
   * one is a badge that opens its stat (#383).
   */
  stats: CandidateStat[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateStat {
  pattern: Pattern;
  statId: string;
}

/** The patterns a candidate can be promoted to — the other ones wait for their own stat. */
export const PROMOTION_PATTERNS: readonly Pattern[] = ['GUS', 'DT'];

/** Create / update payload — [Candidate] minus the server-owned id, its stats and audit. */
export type CandidateInput = Omit<Candidate, 'id' | 'stats' | 'createdAt' | 'updatedAt'>;

/**
 * Outcome of « Promote all to GUS » : the tickers copied to the sheet as GUS by that call, and those
 * left alone because they already had a stat.
 */
export interface BulkPromotion {
  promoted: string[];
  skipped: string[];
}
