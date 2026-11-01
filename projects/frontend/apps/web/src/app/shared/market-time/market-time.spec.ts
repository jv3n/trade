import { describe, expect, it } from 'vitest';
import { marketDay, newYorkMinutes } from './market-time';

/**
 * The trading day is New York's, whatever the browser's zone : at 00:30 in Paris it is still the
 * previous day over there, and a trade or a locate dated by the browser would miss its session.
 * Winter and summer both, since New York's offset moves.
 */
describe('market time', () => {
  const dayOf = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

  it('stays on the previous day until midnight in New York, in summer', () => {
    expect(dayOf(marketDay(new Date('2026-10-14T03:30:00Z')))).toEqual([2026, 10, 13]);
    expect(dayOf(marketDay(new Date('2026-10-14T04:30:00Z')))).toEqual([2026, 10, 14]);
  });

  it('stays on the previous day until midnight in New York, in winter', () => {
    expect(dayOf(marketDay(new Date('2026-12-14T04:30:00Z')))).toEqual([2026, 12, 13]);
    expect(dayOf(marketDay(new Date('2026-12-14T05:30:00Z')))).toEqual([2026, 12, 14]);
  });

  it('crosses a year on New York time', () => {
    expect(dayOf(marketDay(new Date('2027-01-01T02:00:00Z')))).toEqual([2026, 12, 31]);
  });

  it('reads the New York wall clock, and the weekend', () => {
    expect(newYorkMinutes(new Date('2026-09-18T13:30:00Z'))).toEqual({
      minutes: 9 * 60 + 30,
      weekend: false,
    });
    expect(newYorkMinutes(new Date('2026-09-19T14:00:00Z')).weekend).toBe(true);
  });
});
