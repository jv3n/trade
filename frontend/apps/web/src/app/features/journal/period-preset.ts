import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
  subYears,
} from 'date-fns';

/**
 * Period shortcuts for the journal filter. Each preset resolves to a `{ dateFrom, dateTo }`
 * pair that the filter uses to populate the date range. `custom` and `all` are special :
 * `custom` lets the user type dates manually, `all` clears the range (no filter).
 */
export type PeriodPresetKey =
  | 'all'
  | 'custom'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear';

export const PERIOD_PRESETS: readonly PeriodPresetKey[] = [
  'all',
  'custom',
  'thisMonth',
  'lastMonth',
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
