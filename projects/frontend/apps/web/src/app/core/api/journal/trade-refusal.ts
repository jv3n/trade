import { HttpErrorResponse } from '@angular/common/http';

/** The backend's `TradeRefusal`, each with its reason in the interface language. */
const TRADE_REFUSALS: Record<string, string> = {
  FUTURE_DATE: 'journal.refused.futureDate',
  NO_ENTRY: 'journal.refused.noEntry',
  EXITS_EXCEED_ENTRIES: 'journal.refused.exitsExceedEntries',
  EXIT_BEFORE_ENTRY: 'journal.refused.exitBeforeEntry',
  REAL_PNL_NEEDS_CLOSED_POSITION: 'journal.refused.realPnlNeedsClosedPosition',
  STAT_OWNS_PATTERN: 'journal.refused.statOwnsPattern',
  STAT_OWNS_DAY_AND_TICKER: 'journal.refused.statOwnsDayAndTicker',
};

/** The i18n key of why a trade write failed, null when the failure carries no known reason. */
export function tradeRefusalKey(error: unknown): string | null {
  const code = error instanceof HttpErrorResponse ? error.error?.code : null;
  return typeof code === 'string' ? (TRADE_REFUSALS[code] ?? null) : null;
}
