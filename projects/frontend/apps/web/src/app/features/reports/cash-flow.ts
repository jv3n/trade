import { differenceInCalendarDays } from 'date-fns';
import {
  AccountMovementType,
  CashFlowBucket,
  CashFlowBucketSize,
} from '../../core/api/account/account.model';
import { PeriodPresetKey } from '../../shared/period-preset/period-preset';

/** The bar sizes, narrowest first — the order of the « Une barre par » toggle. */
export const BUCKET_SIZES: readonly CashFlowBucketSize[] = [
  'DAY',
  'WEEK',
  'MONTH',
  'QUARTER',
  'YEAR',
];

/** The type chips, in the order of the mockup. */
export const REPORT_TYPES: readonly AccountMovementType[] = [
  'TRADE',
  'LOCATE',
  'DEPOSIT',
  'WITHDRAWAL',
  'ADJUSTMENT',
];

/** « Trading seul » : what the trading did, without the money moved in and out around it. */
export const TRADING_ONLY: readonly AccountMovementType[] = ['TRADE', 'LOCATE'];

/** The endpoint refuses more bars than this (#694) ; a choice that would draw them is disabled. */
export const MAX_BARS = 400;

/** A bar's nominal length in days — enough to tell a size wider than the period from one that fits. */
const BUCKET_DAYS: Record<CashFlowBucketSize, number> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 28,
  QUARTER: 90,
  YEAR: 365,
};

/**
 * The size a period opens with (PARCOURS, « Flux du compte ») : a month by days, a quarter or a
 * half-year by weeks, a year or all time by months. A custom range follows its length the same way.
 */
export function defaultBucketSize(
  period: PeriodPresetKey,
  from: Date | null,
  to: Date | null,
): CashFlowBucketSize {
  switch (period) {
    case 'today':
    case 'thisMonth':
    case 'lastMonth':
      return 'DAY';
    case 'last3Months':
    case 'last6Months':
    case 'thisQuarter':
    case 'lastQuarter':
      return 'WEEK';
    case 'thisYear':
    case 'lastYear':
    case 'all':
      return 'MONTH';
    case 'custom': {
      const days = spanInDays(from, to);
      if (days === null || days > 200) return 'MONTH';
      return days > 62 ? 'WEEK' : 'DAY';
    }
  }
}

/**
 * Whether [size] can be drawn over [from]..[to] : not wider than the period (a single bar says
 * nothing), and not so narrow it would draw more than [MAX_BARS]. An unknown span allows anything —
 * the answer tells.
 */
export function bucketSizeAllowed(
  size: CashFlowBucketSize,
  from: Date | null,
  to: Date | null,
): boolean {
  const days = spanInDays(from, to);
  if (days === null) return true;
  const length = BUCKET_DAYS[size];
  return length <= Math.max(days, 1) && Math.ceil(days / length) <= MAX_BARS;
}

/** The narrowest allowed size from [preferred] on — the default can fall outside a short period. */
export function fittingBucketSize(
  preferred: CashFlowBucketSize,
  from: Date | null,
  to: Date | null,
): CashFlowBucketSize {
  if (bucketSizeAllowed(preferred, from, to)) return preferred;
  const allowed = BUCKET_SIZES.filter((s) => bucketSizeAllowed(s, from, to));
  const wider = allowed.filter((s) => BUCKET_DAYS[s] > BUCKET_DAYS[preferred]);
  return wider[0] ?? allowed[allowed.length - 1] ?? preferred;
}

/** Days covered, both ends included ; null when an end is open. */
function spanInDays(from: Date | null, to: Date | null): number | null {
  return from && to ? differenceInCalendarDays(to, from) + 1 : null;
}

/** The stacked series of the chart. Locates and corrections are one « fees » series (#697). */
export type FlowSeriesKey = 'winning' | 'losing' | 'fees' | 'deposits' | 'withdrawals';

/** The series the chips let through, in stacking order. */
export function seriesKeys(types: readonly AccountMovementType[]): FlowSeriesKey[] {
  const on = new Set(types);
  const keys: FlowSeriesKey[] = [];
  if (on.has('TRADE')) keys.push('winning', 'losing');
  if (on.has('LOCATE') || on.has('ADJUSTMENT')) keys.push('fees');
  if (on.has('DEPOSIT')) keys.push('deposits');
  if (on.has('WITHDRAWAL')) keys.push('withdrawals');
  return keys;
}

/** What one bucket moved per series. */
export function seriesValues(bucket: CashFlowBucket): Record<FlowSeriesKey, number> {
  return {
    winning: bucket.winningTrades,
    losing: bucket.losingTrades,
    fees: bucket.locates + bucket.adjustments,
    deposits: bucket.deposits,
    withdrawals: bucket.withdrawals,
  };
}

/** The period's totals, per field of a bucket. */
export interface FlowTotals {
  winningTrades: number;
  losingTrades: number;
  locates: number;
  deposits: number;
  withdrawals: number;
  adjustments: number;
  net: number;
}

export function totals(buckets: readonly CashFlowBucket[]): FlowTotals {
  const sum = (pick: (b: CashFlowBucket) => number) => buckets.reduce((s, b) => s + pick(b), 0);
  return {
    winningTrades: sum((b) => b.winningTrades),
    losingTrades: sum((b) => b.losingTrades),
    locates: sum((b) => b.locates),
    deposits: sum((b) => b.deposits),
    withdrawals: sum((b) => b.withdrawals),
    adjustments: sum((b) => b.adjustments),
    net: sum((b) => b.net),
  };
}

/** True when nothing moved over the period — the page shows its empty state, not an empty frame. */
export function nothingMoved(buckets: readonly CashFlowBucket[]): boolean {
  return buckets.every((b) => Object.values(seriesValues(b)).every((v) => v === 0));
}

/** One line of the breakdown. [indent] marks the winners and losers under « Trades ». */
export interface BreakdownRow {
  key: string;
  amount: number;
  /** Share of the period's gross flows (amounts without their sign), 0..100. */
  share: number;
  indent: boolean;
}

/**
 * The breakdown beside the chart : one line per type the chips let through, the trades split into
 * winners and losers, each with its share of the period's **gross** flows — a share of the net
 * would blow up whenever the net is small (PARCOURS, « Flux du compte »).
 */
export function breakdown(t: FlowTotals, types: readonly AccountMovementType[]): BreakdownRow[] {
  const on = new Set(types);
  const lines: { key: string; amount: number; indent: boolean; type: AccountMovementType }[] = [
    { key: 'trades', amount: t.winningTrades + t.losingTrades, indent: false, type: 'TRADE' },
    { key: 'winning', amount: t.winningTrades, indent: true, type: 'TRADE' },
    { key: 'losing', amount: t.losingTrades, indent: true, type: 'TRADE' },
    { key: 'locates', amount: t.locates, indent: false, type: 'LOCATE' },
    { key: 'adjustments', amount: t.adjustments, indent: false, type: 'ADJUSTMENT' },
    { key: 'deposits', amount: t.deposits, indent: false, type: 'DEPOSIT' },
    { key: 'withdrawals', amount: t.withdrawals, indent: false, type: 'WITHDRAWAL' },
  ];
  const shown = lines.filter((l) => on.has(l.type));
  const gross = shown.filter((l) => l.key !== 'trades').reduce((s, l) => s + Math.abs(l.amount), 0);
  return shown.map(({ key, amount, indent }) => ({
    key,
    amount,
    indent,
    share:
      gross === 0
        ? 0
        : ((key === 'trades'
            ? Math.abs(t.winningTrades) + Math.abs(t.losingTrades)
            : Math.abs(amount)) /
            gross) *
          100,
  }));
}
