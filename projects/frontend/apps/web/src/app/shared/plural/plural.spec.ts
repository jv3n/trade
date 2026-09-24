import { describe, expect, it } from 'vitest';
import { pluralKey } from './plural';

/**
 * A count picks its key by the grammar of the active locale (#382), so the reader never meets
 * « 1 trades clôturés » or « étape(s) ». French and English disagree on zero, which is why this
 * leans on `Intl.PluralRules` rather than a `count === 1` test.
 */
describe('pluralKey', () => {
  it('reads the singular key at one', () => {
    expect(pluralKey('journal.kpi.trades', 1, 'fr')).toBe('journal.kpi.tradesOne');
    expect(pluralKey('journal.kpi.trades', 1, 'en')).toBe('journal.kpi.tradesOne');
  });

  it('reads the plural key from two up', () => {
    expect(pluralKey('journal.kpi.trades', 2, 'fr')).toBe('journal.kpi.trades');
    expect(pluralKey('journal.kpi.trades', 12, 'en')).toBe('journal.kpi.trades');
  });

  it('puts zero in the singular in French and in the plural in English', () => {
    expect(pluralKey('today.steps.progress', 0, 'fr')).toBe('today.steps.progressOne');
    expect(pluralKey('today.steps.progress', 0, 'en')).toBe('today.steps.progress');
  });
});
