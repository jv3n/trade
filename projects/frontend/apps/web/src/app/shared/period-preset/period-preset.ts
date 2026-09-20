import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
  subYears,
} from 'date-fns';

/**
 * Period shortcuts for the list filters (journal, stats, account). Each preset resolves to a
 * `{ dateFrom, dateTo }` pair that the filter uses to populate the date range. `custom` and `all`
 * are special : `custom` lets the user type dates manually, `all` clears the range (no filter).
 */
export type PeriodPresetKey =
  | 'all'
  | 'custom'
  | 'thisMonth'
  | 'lastMonth'
  | 'last3Months'
  | 'last6Months'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear';

export const PERIOD_PRESETS: readonly PeriodPresetKey[] = [
  'all',
  'custom',
  'thisMonth',
  'lastMonth',
  'last3Months',
  'last6Months',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
];

export interface PeriodRange {
  dateFrom: Date | null;
  dateTo: Date | null;
}

/**
 * Resolves a preset key to a date range. `now` is injectable for tests ; production callers
 * leave it default and get the current instant.
 */
export function computePeriodRange(key: PeriodPresetKey, now: Date = new Date()): PeriodRange {
  switch (key) {
    case 'all':
    case 'custom':
      return { dateFrom: null, dateTo: null };
    case 'thisMonth':
      return { dateFrom: startOfMonth(now), dateTo: endOfMonth(now) };
    case 'lastMonth': {
      const d = subMonths(now, 1);
      return { dateFrom: startOfMonth(d), dateTo: endOfMonth(d) };
    }
    // Rolling windows, not calendar ones : « last 3 months » ends today, where `lastQuarter`
    // snaps to quarter boundaries. Both are offered because they answer different questions.
    case 'last3Months':
      return { dateFrom: startOfDay(subMonths(now, 3)), dateTo: endOfDay(now) };
    case 'last6Months':
      return { dateFrom: startOfDay(subMonths(now, 6)), dateTo: endOfDay(now) };
    case 'thisQuarter':
      return { dateFrom: startOfQuarter(now), dateTo: endOfQuarter(now) };
    case 'lastQuarter': {
      const d = subQuarters(now, 1);
      return { dateFrom: startOfQuarter(d), dateTo: endOfQuarter(d) };
    }
    case 'thisYear':
      return { dateFrom: startOfYear(now), dateTo: endOfYear(now) };
    case 'lastYear': {
      const d = subYears(now, 1);
      return { dateFrom: startOfYear(d), dateTo: endOfYear(d) };
    }
  }
}
