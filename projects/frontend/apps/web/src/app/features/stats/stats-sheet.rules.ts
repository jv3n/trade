import { isBefore } from 'date-fns';
import {
  DEFAULT_PATTERN,
  Pattern,
  STAT_PATTERNS,
  StatPattern,
} from '../../core/api/shared/pattern.model';
import { StatEntry, StatStatus } from '../../core/api/stats/stat-entry.model';
import { type SkeletonColumnDefs } from '../../shared/skeleton-columns/skeleton-columns';
import {
  DT_SESSION_CLOSES,
  DT_SESSION_OPENS,
  DoubleTopDurations,
  DoubleTopLegs,
  GusSequence,
} from './stats.math';

/** Sort state — controlled-component shape (empty `columnName` = the backend's DEFAULT_SORT). */
export interface SortRequest {
  columnName: string;
  isAscending: boolean;
}

/**
 * The session block being typed in the session panel — the GUS session, or the four prices of a
 * double top on a DT stat. Numbers are null until typed.
 */
export interface SessionModel {
  openPrice: number | null;
  pushOpenPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  eodPrice: number | null;
  /** The GUS sequence (#713) : the push's time, and the drop with its time — optional. */
  pushOpenTime: string | null;
  gusDropPrice: number | null;
  gusDropTime: string | null;
  dtStartPrice: number | null;
  dtTopPrice: number | null;
  dtLowPrice: number | null;
  dtRetestPrice: number | null;
  /** `HH:mm`, null until typed (#469). */
  dtStartTime: string | null;
  dtTopTime: string | null;
  dtLowTime: string | null;
  dtRetestTime: string | null;
  /** The lowest print after the retest (#706) — optional, out of the tick. */
  dtDropPrice: number | null;
  dtDropTime: string | null;
  ssr: boolean;
  noPush: boolean;
  /** The Sink is not read and will not be (#729) — the observer's mark, never a market fact. */
  dropNotRead: boolean;
  highInstitutions: boolean;
}

/** The premarket block being typed in the premarket card — copied from the candidate, editable. */
export interface PremarketModel {
  /** Never changed : a GUS and a double top are two stats (#648). */
  pattern: Pattern;
  previousClose: number | null;
  pmOpen: number | null;
  pmHigh: number | null;
  floatMillions: number | null;
  volumeMillions: number | null;
  note: string;
}

/** Who a new stat is : typed on top of the premarket card, only when creating one (#326). */
export interface IdentityModel {
  tradeDate: Date | null;
  pattern: Pattern;
  ticker: string;
}

/** The two cards of the panel — each shows where its own last save stands. */
export type SheetCard = 'premarket' | 'session';

/**
 * Where a card's save stands, shown next to its title (no « Save » button, #326) : in flight, done
 * at a time, or refused with the reason (an i18n key).
 */
export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  at: Date | null;
  reason: string | null;
}

export type PremarketPrice =
  'previousClose' | 'pmOpen' | 'pmHigh' | 'floatMillions' | 'volumeMillions';

/** A listed stat with its derived percentages (never stored — recomputed from the prices). */
export interface StatRow extends StatEntry {
  gap: number | null;
  pmPush: number | null;
  /** Previous close → PM high (#499), the scanner's reading — shown under the gap. */
  cumulativePmHigh: number | null;
  /** Previous close → open, what the scanner still showed at the bell — shown under the open. */
  cumulativeOpen: number | null;
  /** PM high → open (#499) : what survives of the premarket. */
  hold: number | null;
  pushOpenPercent: number | null;
  hodPercent: number | null;
  lodPercent: number | null;
  eodPercent: number | null;
  /** The double top legs — null on any other pattern, or until their prices are in. */
  legs: DoubleTopLegs;
  /** How long each leg took (#469) — null on any other pattern, or until its times are in. */
  durations: DoubleTopDurations;
  /** The GUS's push time and drop (#713) — null on a DT, or until typed. */
  gus: GusSequence;
  /** A completed GUS with no drop typed (#713) : optional, but there was one to record. */
  gusDropToFill: boolean;
  /** Label keys of the session prices still missing — the ✓ stays disabled until it's empty. */
  missing: string[];
  /** Why the day's range refuses this row (#305) — null when it holds. Blocks the ✓ too. */
  issue: string | null;
}

/**
 * Tabs of the mockup : all / the scanner's stats to review (#764) / to complete / completed, then the
 * no-push days (#302) — a separate axis of the filter, singled out to compare their premarket with
 * the days that pushed.
 */
export type StatTab = StatStatus | 'TO_REVIEW' | 'NO_PUSH' | null;

/**
 * Filters on a condition the app derives (#499) — toggles beside the tabs, not tabs : they combine
 * with any of them, and with each other.
 */
export type DerivedFilter = 'OUT_OF_PATTERN' | 'UNDER_1_DOLLAR';
export const DERIVED_FILTERS: readonly DerivedFilter[] = ['OUT_OF_PATTERN', 'UNDER_1_DOLLAR'];
export const STATUS_TABS: readonly StatTab[] = [
  null,
  'TO_REVIEW',
  'TO_COMPLETE',
  'COMPLETED',
  'NO_PUSH',
];

/**
 * The views of the page (#437) : the KPIs, the table's columns and the averages follow the pattern
 * — a GUS and a double top are not measured alike, and they are the only two a stat measures
 * (#648). « All » keeps what compares across patterns, and no average.
 */
export type StatView = StatPattern | 'ALL';
export const VIEWS: readonly StatView[] = [...STAT_PATTERNS, 'ALL'];

/** The view a stat shows in — its pattern's own ; a stat left under another pattern, only « All ». */
export function viewOf(pattern: Pattern): StatView {
  return (STAT_PATTERNS as readonly Pattern[]).includes(pattern) ? (pattern as StatPattern) : 'ALL';
}

/** The view measured on the session — open, push, HOD / LOD / EOD — and its « no push » tab. */
export function isSessionView(view: StatView): boolean {
  return view === 'GUS';
}

/** What names a row and what acts on it (#821) : on arrival, with no sideways scroll. */
const LEADING_COLUMNS = [
  'tradeDate',
  'ticker',
  'pattern',
  'completed',
  'trade',
  'actions',
] as const;
const PREMARKET_COLUMNS = ['gap', 'pmPush', 'float', 'volume'] as const;
export const DOUBLE_TOP_FOOTER_COLUMNS: readonly string[] = [
  'dtAveragesLabel',
  'dtTop',
  'dtLow',
  'dtRetest',
  'dtDuration',
  'dtDrop',
  'dtAveragesEnd',
];
export const NO_COLUMNS: readonly string[] = [];
/** The medians row of the session views (#499) : a label over the columns up to the open. */
export const SESSION_FOOTER_COLUMNS: readonly string[] = [
  'sessionMediansLabel',
  'hold',
  'pushOpen',
  'hod',
  'lod',
  'eod',
  'gusDrop',
  'sessionMediansEnd',
];
const SESSION_COLUMNS: readonly string[] = [
  ...LEADING_COLUMNS,
  ...PREMARKET_COLUMNS,
  'openPrice',
  'hold',
  'pushOpen',
  'hod',
  'lod',
  'eod',
  'gusDrop',
  'flags',
];
export const COLUMNS: Record<StatView, readonly string[]> = {
  GUS: SESSION_COLUMNS,
  // A double top has no premarket prices (#649) : no gap, no PM push.
  DT: [
    ...LEADING_COLUMNS,
    ...PREMARKET_COLUMNS.filter((c) => c !== 'gap' && c !== 'pmPush'),
    'dtStart',
    'dtTop',
    'dtLow',
    'dtRetest',
    'dtDuration',
    'dtDrop',
    'flags',
  ],
  ALL: [...LEADING_COLUMNS, ...PREMARKET_COLUMNS, 'brief', 'flags'],
};

export function tabFromQuery(value: string | null): StatTab {
  return STATUS_TABS.find((tab) => tab !== null && tab === value) ?? null;
}

/** `?derived=OUT_OF_PATTERN` (repeated or comma-separated) — unknown values are dropped. */
export function derivedFromQuery(values: readonly string[]): readonly DerivedFilter[] {
  const named = new Set(values.flatMap((value) => value.split(',')));
  return DERIVED_FILTERS.filter((filter) => named.has(filter));
}

export const DEFAULT_PAGE_SIZE = 25;

/** Empty session block — what the panel shows before a stat is picked. */
export const BLANK_SESSION: SessionModel = {
  openPrice: null,
  pushOpenPrice: null,
  hodPrice: null,
  lodPrice: null,
  eodPrice: null,
  pushOpenTime: null,
  gusDropPrice: null,
  gusDropTime: null,
  dtStartPrice: null,
  dtTopPrice: null,
  dtLowPrice: null,
  dtRetestPrice: null,
  dtStartTime: null,
  dtTopTime: null,
  dtLowTime: null,
  dtRetestTime: null,
  dtDropPrice: null,
  dtDropTime: null,
  ssr: false,
  noPush: false,
  dropNotRead: false,
  highInstitutions: false,
};

export const BLANK_PREMARKET: PremarketModel = {
  pattern: DEFAULT_PATTERN,
  previousClose: null,
  pmOpen: null,
  pmHigh: null,
  floatMillions: null,
  volumeMillions: null,
  note: '',
};

export const IDLE: SaveState = { status: 'idle', at: null, reason: null };

/** No push typed before « no push » was ticked — nothing to give back (#713 : the time goes too). */
export const NO_TYPED_PUSH: { price: number | null; time: string | null } = {
  price: null,
  time: null,
};

/** Errors that say « the other card is holding this one » — the only ones a save settles (#348). */
export const HELD_REASONS: readonly string[] = [
  'stats.save.waitingPremarket',
  'stats.save.waitingSession',
];

export type SessionPrice =
  | 'openPrice'
  | 'pushOpenPrice'
  | 'hodPrice'
  | 'lodPrice'
  | 'eodPrice'
  | 'gusDropPrice'
  | 'dtStartPrice'
  | 'dtTopPrice'
  | 'dtLowPrice'
  | 'dtRetestPrice'
  | 'dtDropPrice';

/** The four times of a double top (#469) and its drop's (#706) ; the GUS push's and drop's (#713). */
export type SessionTime =
  | 'dtStartTime'
  | 'dtTopTime'
  | 'dtLowTime'
  | 'dtRetestTime'
  | 'dtDropTime'
  | 'pushOpenTime'
  | 'gusDropTime';

/** A field the session card can point at when something is wrong with it. */
export type SessionField = SessionPrice | SessionTime;

/** The five session prices, in the sheet's order, with the label key naming them. */
const SESSION_PRICES: readonly { field: SessionPrice; label: string }[] = [
  { field: 'openPrice', label: 'stats.fields.openPriceShort' },
  { field: 'pushOpenPrice', label: 'stats.fields.pushOpen' },
  { field: 'hodPrice', label: 'stats.fields.hod' },
  { field: 'lodPrice', label: 'stats.fields.lod' },
  { field: 'eodPrice', label: 'stats.fields.eod' },
];

/** The first day the double top's drop was asked for (#726) — the backend's `DT_DROP_SINCE`. */
export const DT_DROP_SINCE = new Date(2026, 9, 12);

/**
 * A point of the sheet ; `since`, for a field added after the history began, is the first day it is
 * asked for — the stats of an earlier day are complete without it (#726).
 */
interface SheetPoint<F> {
  field: F;
  label: string;
  since?: Date;
}

/** The five prices of a double top, in the order it forms — the drop last (#706). */
export const DOUBLE_TOP_PRICES: readonly SheetPoint<SessionPrice>[] = [
  { field: 'dtStartPrice', label: 'stats.fields.dtStart' },
  { field: 'dtTopPrice', label: 'stats.fields.dtTop' },
  { field: 'dtLowPrice', label: 'stats.fields.dtLow' },
  { field: 'dtRetestPrice', label: 'stats.fields.dtRetest' },
  { field: 'dtDropPrice', label: 'stats.fields.dtDrop', since: DT_DROP_SINCE },
];

/** Their five times, in the same order — required to tick like the prices (#469). */
export const DOUBLE_TOP_TIMES: readonly SheetPoint<SessionTime>[] = [
  { field: 'dtStartTime', label: 'stats.fields.dtStartTimeShort' },
  { field: 'dtTopTime', label: 'stats.fields.dtTopTimeShort' },
  { field: 'dtLowTime', label: 'stats.fields.dtLowTimeShort' },
  { field: 'dtRetestTime', label: 'stats.fields.dtRetestTimeShort' },
  { field: 'dtDropTime', label: 'stats.fields.dtDropTimeShort', since: DT_DROP_SINCE },
];

/**
 * A double top whose retest took the top back : a breakout, with no drop to measure after it — the
 * tick waits for four points instead of five (#710).
 */
export function retestTookTop(session: Pick<SessionModel, 'dtTopPrice' | 'dtRetestPrice'>) {
  const { dtTopPrice: top, dtRetestPrice: retest } = session;
  return top !== null && retest !== null && top > 0 && retest >= top;
}

/** Whether a stat of [tradeDate] is asked for [point] — a stat not dated yet is asked everything. */
export function isAsked(point: { since?: Date }, tradeDate: Date | null): boolean {
  return !point.since || !tradeDate || !isBefore(tradeDate, point.since);
}

/**
 * The points a double top needs to tick — its five, or four when the retest took the top, when it
 * was recorded before the drop was asked, or when its drop is marked as not read (#729).
 */
export function doubleTopPoints<T extends SheetPoint<SessionField>>(
  points: readonly T[],
  session: Pick<SessionModel, 'dtTopPrice' | 'dtRetestPrice' | 'dropNotRead'>,
  tradeDate: Date | null,
): readonly T[] {
  const withoutDrop = retestTookTop(session) || session.dropNotRead;
  return points.filter(
    (point) =>
      isAsked(point, tradeDate) &&
      !(withoutDrop && (point.field === 'dtDropPrice' || point.field === 'dtDropTime')),
  );
}

/**
 * Whether the Sink can be marked as not read (#729) : always on a GUS ; on a double top only when a
 * Sink is asked — none after a retest that took the top, none before the drop was asked.
 */
export function dropCanBeNotRead(
  session: Pick<SessionModel, 'dtTopPrice' | 'dtRetestPrice'>,
  pattern: Pattern,
  tradeDate: Date | null,
): boolean {
  if (pattern !== 'DT') return true;
  return !retestTookTop(session) && isAsked({ since: DT_DROP_SINCE }, tradeDate);
}

/** The Sink's own fields — typing one of them clears the « not read » mark (#729). */
const DROP_FIELDS: readonly SessionField[] = [
  'gusDropPrice',
  'gusDropTime',
  'dtDropPrice',
  'dtDropTime',
];

/** Typing a Sink takes the « not read » mark off — the two never sit together. */
export function markCleared(field: SessionField, value: unknown): Partial<SessionModel> {
  return DROP_FIELDS.includes(field) && value !== null && value !== ''
    ? { dropNotRead: false }
    : {};
}

/** The session prices a stat needs — all five, four on a no-push day, a double top's points. */
export function expectedPrices(
  session: Pick<SessionModel, SessionField | 'noPush' | 'dropNotRead'>,
  pattern: Pattern,
  tradeDate: Date | null,
) {
  if (pattern === 'DT') return doubleTopPoints(DOUBLE_TOP_PRICES, session, tradeDate);
  return SESSION_PRICES.filter(({ field }) => !(session.noPush && field === 'pushOpenPrice'));
}

/**
 * Label keys of the session prices still missing — and a double top's times (#469) — what stands
 * between a stat and its tick.
 */
export function missingPrices(
  session: Pick<SessionModel, SessionField | 'noPush' | 'dropNotRead'>,
  pattern: Pattern,
  tradeDate: Date | null,
): string[] {
  const prices = expectedPrices(session, pattern, tradeDate)
    .filter(({ field }) => !isPositive(session[field]))
    .map((p) => p.label);
  if (pattern !== 'DT') return prices;
  return [
    ...prices,
    ...doubleTopPoints(DOUBLE_TOP_TIMES, session, tradeDate)
      .filter(({ field }) => !session[field])
      .map((t) => t.label),
  ];
}

export function premarketOf(entry: StatEntry): PremarketModel {
  return {
    pattern: entry.pattern,
    previousClose: entry.previousClose,
    pmOpen: entry.pmOpen,
    pmHigh: entry.pmHigh,
    floatMillions: entry.floatMillions,
    volumeMillions: entry.volumeMillions,
    note: entry.note ?? '',
  };
}

/**
 * Why a premarket block can't be saved — an i18n key — or null when it can. A double top carries no
 * premarket prices (#649), so nothing to check.
 */
export function premarketProblem(m: PremarketModel, pattern: Pattern = m.pattern): string | null {
  if (pattern === 'DT') return null;
  if (![m.previousClose, m.pmOpen, m.pmHigh].every(isPositive)) {
    return 'stats.save.premarketRequired';
  }
  if ((m.pmHigh as number) < (m.pmOpen as number)) return 'stats.save.pmHighBelowPmOpen';
  return null;
}

/**
 * A day's range holds every price inside it (#305) : `LOD <= open, push, EOD <= HOD`. Returns the
 * i18n key of what is wrong and the fields that make it wrong — the HOD / LOD pair was the only
 * check before, so a stat could carry a HOD of 1 under a push of 10 and still be ticked. Prices at
 * zero are refused too, by [missingPrices] on the panel and by the backend on write.
 */
export function sessionProblem(
  session: SessionModel,
  pattern: Pattern,
): { reason: string; fields: SessionField[] } | null {
  if (pattern === 'DT') return doubleTopProblem(session);
  const { hodPrice: hod, lodPrice: lod } = session;
  if (hod !== null && lod !== null && hod < lod) {
    return { reason: 'stats.save.hodBelowLod', fields: ['hodPrice', 'lodPrice'] };
  }
  const inside: SessionPrice[] = ['openPrice', 'pushOpenPrice', 'eodPrice', 'gusDropPrice'];
  const above = inside.filter((f) => hod !== null && session[f] !== null && session[f]! > hod);
  if (above.length > 0) return { reason: 'stats.save.aboveHod', fields: [...above, 'hodPrice'] };
  const below = inside.filter((f) => lod !== null && session[f] !== null && session[f]! < lod);
  if (below.length > 0) return { reason: 'stats.save.belowLod', fields: [...below, 'lodPrice'] };
  return gusDropProblem(session);
}

/**
 * The drop of a GUS (#713) : its time not before the push's, both times inside the extended
 * session, price and time together, and a push time to time it from. The backend refuses the same.
 * No bound against the push : a session that kept rising ends above it, a loss for the short (#729).
 */
function gusDropProblem(session: SessionModel): { reason: string; fields: SessionField[] } | null {
  const drop = session.gusDropPrice;
  for (const field of ['pushOpenTime', 'gusDropTime'] as const) {
    const time = session[field];
    if (time && (time < DT_SESSION_OPENS || time > DT_SESSION_CLOSES)) {
      return { reason: 'stats.save.timeOutsideSession', fields: [field] };
    }
  }
  const { pushOpenTime: pushTime, gusDropTime: dropTime } = session;
  if (pushTime && dropTime && dropTime < pushTime) {
    return { reason: 'stats.save.gusDropBeforePush', fields: ['pushOpenTime', 'gusDropTime'] };
  }
  if (drop !== null && !dropTime) {
    return { reason: 'stats.save.gusDropTimeRequired', fields: ['gusDropTime'] };
  }
  if (drop === null && dropTime) {
    return { reason: 'stats.save.gusDropPriceRequired', fields: ['gusDropPrice'] };
  }
  if (drop !== null && !session.noPush && !pushTime) {
    return { reason: 'stats.save.gusPushTimeRequired', fields: ['pushOpenTime'] };
  }
  return null;
}

/**
 * The shape of a double top (`docs/pattern/DT.md`) : the top not under the start, the rejection
 * low not above the top, the retest not under the low — the backend refuses the same. The drop is
 * free of the retest : a session that rallied off it ends above it, a loss for the short (#729).
 */
function doubleTopProblem(
  session: SessionModel,
): { reason: string; fields: SessionField[] } | null {
  const { dtStartPrice: start, dtTopPrice: top, dtLowPrice: low, dtRetestPrice: retest } = session;
  if (start !== null && top !== null && top < start) {
    return { reason: 'stats.save.topBelowStart', fields: ['dtStartPrice', 'dtTopPrice'] };
  }
  if (top !== null && low !== null && low > top) {
    return { reason: 'stats.save.lowAboveTop', fields: ['dtTopPrice', 'dtLowPrice'] };
  }
  if (low !== null && retest !== null && retest < low) {
    return { reason: 'stats.save.retestBelowLow', fields: ['dtLowPrice', 'dtRetestPrice'] };
  }
  return doubleTopTimesProblem(session) ?? dropPairProblem(session);
}

/**
 * The drop is optional but whole (#706) : its price and its time go together, or the KPIs would
 * count it in their `n` and leave it out of the median duration. The backend refuses the same.
 */
function dropPairProblem(session: SessionModel): { reason: string; fields: SessionField[] } | null {
  const hasPrice = session.dtDropPrice !== null;
  const hasTime = !!session.dtDropTime;
  if (hasPrice && !hasTime)
    return { reason: 'stats.save.dropTimeRequired', fields: ['dtDropTime'] };
  if (hasTime && !hasPrice)
    return { reason: 'stats.save.dropPriceRequired', fields: ['dtDropPrice'] };
  return null;
}

/**
 * The times of a double top (#469), the drop's last (#706) : inside the extended session, and in
 * order — each against the latest one typed before it, so a gap in the middle still orders the
 * rest. The backend refuses the same ; a negative leg would poison the median.
 */
function doubleTopTimesProblem(
  session: SessionModel,
): { reason: string; fields: SessionField[] } | null {
  let previous: SessionTime | null = null;
  for (const field of [...DOUBLE_TOP_TIMES.map((t) => t.field), 'dtDropTime' as const]) {
    const time = session[field];
    if (!time) continue;
    if (time < DT_SESSION_OPENS || time > DT_SESSION_CLOSES) {
      return { reason: 'stats.save.timeOutsideSession', fields: [field] };
    }
    if (previous !== null && time < session[previous]!) {
      return { reason: 'stats.save.timeOutOfOrder', fields: [previous, field] };
    }
    previous = field;
  }
  return null;
}

export function sessionOf(entry: StatEntry): SessionModel {
  return {
    openPrice: entry.openPrice,
    pushOpenPrice: entry.pushOpenPrice,
    hodPrice: entry.hodPrice,
    lodPrice: entry.lodPrice,
    eodPrice: entry.eodPrice,
    pushOpenTime: entry.pushOpenTime,
    gusDropPrice: entry.gusDropPrice,
    gusDropTime: entry.gusDropTime,
    dtStartPrice: entry.dtStartPrice,
    dtTopPrice: entry.dtTopPrice,
    dtLowPrice: entry.dtLowPrice,
    dtRetestPrice: entry.dtRetestPrice,
    dtStartTime: entry.dtStartTime,
    dtTopTime: entry.dtTopTime,
    dtLowTime: entry.dtLowTime,
    dtRetestTime: entry.dtRetestTime,
    dtDropPrice: entry.dtDropPrice,
    dtDropTime: entry.dtDropTime,
    ssr: entry.ssr,
    noPush: entry.noPush,
    dropNotRead: entry.dropNotRead,
    highInstitutions: entry.highInstitutions,
  };
}

/** The listing's columns as its skeleton shows them (#539). */
export const SKELETON_COLUMNS: SkeletonColumnDefs = {
  tradeDate: { key: 'stats.fields.tradeDate' },
  ticker: { key: 'stats.fields.ticker', variant: 'ticker' },
  pattern: { key: 'stats.fields.pattern' },
  gap: { key: 'stats.fields.gap', variant: 'numeric' },
  pmPush: { key: 'stats.fields.pmPush', variant: 'numeric' },
  float: { key: 'stats.fields.float', variant: 'numeric' },
  volume: { key: 'stats.fields.volume', variant: 'numeric' },
  openPrice: { key: 'stats.fields.openPriceShort', variant: 'numeric' },
  hold: { key: 'stats.fields.hold', variant: 'numeric' },
  pushOpen: { key: 'stats.fields.pushOpen', variant: 'numeric' },
  hod: { key: 'stats.fields.hod', variant: 'numeric' },
  lod: { key: 'stats.fields.lod', variant: 'numeric' },
  eod: { key: 'stats.fields.eod', variant: 'numeric' },
  gusDrop: { key: 'stats.gus.column', variant: 'numeric' },
  dtStart: { key: 'stats.fields.dtStart', variant: 'numeric' },
  dtTop: { key: 'stats.doubleTop.columnA', variant: 'numeric' },
  dtLow: { key: 'stats.doubleTop.columnB', variant: 'numeric' },
  dtRetest: { key: 'stats.doubleTop.columnC', variant: 'numeric' },
  dtDuration: { key: 'stats.fields.dtDuration', variant: 'numeric' },
  dtDrop: { key: 'stats.doubleTop.columnD', variant: 'numeric' },
  brief: { key: 'stats.fields.brief' },
  flags: { key: 'stats.fields.flags' },
  // The completion tick : an icon button — `$icon-button-size`.
  completed: { text: '✓', variant: 'blank', width: '36px' },
  trade: { key: 'stats.fields.trade' },
  actions: { variant: 'actions' },
};

export function isPositive(n: number | null): boolean {
  return n !== null && n > 0;
}
