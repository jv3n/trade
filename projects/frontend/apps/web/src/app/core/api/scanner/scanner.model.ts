/**
 * One run of ts-scanner over [tradingDate] (#763), as the scanner reported it. A null [finishedAt]
 * is a run cut short ; [error] says why it failed ; [missedTickers], which tickers a run that went
 * on could not read (#779) — a partial run, not a failed one.
 */
export interface ScannerRun {
  tradingDate: Date;
  startedAt: Date;
  finishedAt: Date | null;
  tickersScanned: number;
  gusFound: number;
  dtFound: number;
  error: string | null;
  missedTickers: string[];
}
