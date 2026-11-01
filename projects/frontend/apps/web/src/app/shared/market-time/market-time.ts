const NEW_YORK = 'America/New_York';

/**
 * Reads the New York wall clock : the trading day is defined over there, so deriving the day's
 * state from the browser's own timezone would put the user's evening in the middle of the session.
 */
export function newYorkMinutes(now: Date): { minutes: number; weekend: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = value('weekday');
  return {
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
    weekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

/** The trading day of [now], at local midnight : a day goes over the wire as `yyyy-MM-dd`. */
export function marketDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(value('year'), value('month') - 1, value('day'));
}
