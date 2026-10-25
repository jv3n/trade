/**
 * One run of ts-scanner over [tradingDate] (#763), as the scanner reported it. A null [finishedAt]
 * is a run cut short ; [error] says why it failed.
 */
export interface ScannerRun {
  tradingDate: Date;
  startedAt: Date;
  finishedAt: Date | null;
  tickersScanned: number;
  gusFound: number;
  dtFound: number;
  error: string | null;
}
