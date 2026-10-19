import { Params } from '@angular/router';
import { format, isValid, parseISO } from 'date-fns';

/**
 * The type filter as the user reads it. `cash` groups deposits and withdrawals : from the ledger's
 * point of view they are the same question — money I put in or took out — and the mockup offers
 * them as one choice. `fees` groups locates and corrections the same way, as the report's fees
 * series does (#739).
 */
export type MovementTypeFilter = 'all' | 'trades' | 'cash' | 'corrections' | 'locates' | 'fees';

export const MOVEMENT_TYPE_FILTERS: readonly MovementTypeFilter[] = [
  'all',
  'trades',
  'cash',
  'corrections',
  'locates',
  'fees',
];

/** The anchor of the movements table — a link that names its filters lands on it. */
export const MOVEMENTS_FRAGMENT = 'movements';

/** What a link to the account's movements carries (#739) : a range of days and a type. */
export interface MovementsQuery {
  dateFrom: Date;
  dateTo: Date;
  type: MovementTypeFilter;
}

/** `?from=2026-09-14&to=2026-09-20&type=trades` — days, not instants, so the link reads the same anywhere. */
export function toMovementsParams(query: MovementsQuery): Params {
  return {
    from: format(query.dateFrom, 'yyyy-MM-dd'),
    to: format(query.dateTo, 'yyyy-MM-dd'),
    type: query.type,
  };
}

/**
 * The filter a link names, or null when it names none that holds : both days, in order, and a known
 * type. A half-read link would show a list that is not the one it promised.
 */
export function movementsQueryFrom(params: {
  get(name: string): string | null;
}): MovementsQuery | null {
  const from = params.get('from');
  const to = params.get('to');
  const type = params.get('type');
  if (!from || !to || !MOVEMENT_TYPE_FILTERS.includes(type as MovementTypeFilter)) return null;
  const dateFrom = parseISO(from);
  const dateTo = parseISO(to);
  if (!isValid(dateFrom) || !isValid(dateTo) || dateTo < dateFrom) return null;
  return { dateFrom, dateTo, type: type as MovementTypeFilter };
}
