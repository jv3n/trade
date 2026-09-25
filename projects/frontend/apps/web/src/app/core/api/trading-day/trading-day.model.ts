/**
 * What the user declared about a day on the Today page (#407) — each mark is the instant it was
 * set, null when not declared. Stored as said : the page decides whether the day's data overrides it.
 */
export interface TradingDay {
  tradingDate: Date;
  noCandidateAt: Date | null;
  noTradeAt: Date | null;
}

/** The whole state of a day's marks, as written back. */
export interface TradingDayMarks {
  noCandidate: boolean;
  noTrade: boolean;
}
