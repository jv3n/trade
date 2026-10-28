/** Whether a stat's day has its bars (#784) : found, not fetched yet, or none served. */
export type DayChartState = 'FOUND' | 'PENDING' | 'NOT_FOUND';

/** One 1-min bar ; [time] is its opening minute, epoch ms. */
export interface DayBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** The chart of a stat's ticker-day ; [bars] is empty unless [state] is `FOUND`. */
export interface DayChart {
  ticker: string;
  state: DayChartState;
  bars: DayBar[];
}
