import { describe, expect, it } from 'vitest';

import { indexLetter, splitTerm } from './lexicon-term';

/**
 * Pins the term split the cards render (#253). The tests that matter are the ones proving the rule
 * stays out of the way : the glossary parenthesises plenty that is not an acronym.
 */
describe('splitTerm', () => {
  it('reads a trailing acronym as the heading and the rest as its expansion', () => {
    expect(splitTerm('Double Top (DT)')).toEqual({ heading: 'DT', expansion: 'Double Top' });
    expect(splitTerm('Short Seller Restriction (SSR)')).toEqual({
      heading: 'SSR',
      expansion: 'Short Seller Restriction',
    });
    expect(splitTerm('Year-to-Date (YTD)')).toEqual({ heading: 'YTD', expansion: 'Year-to-Date' });
  });

  it('leaves a term whole when the parentheses hold something other than an acronym', () => {
    // Real entries of the seeded glossary — each would break under a looser rule.
    for (const term of [
      'Average TP (Take Profit)',
      'Level II (Market Depth)',
      'Risk per trade ($)',
      'EXT w/ Gap (Extension with Gap) (%)',
      'Moving Average (M.A.)',
    ]) {
      expect(splitTerm(term)).toEqual({ heading: term, expansion: null });
    }
  });

  it('leaves a bare term, acronym or not, exactly as written', () => {
    expect(splitTerm('GUS')).toEqual({ heading: 'GUS', expansion: null });
    expect(splitTerm('Borrow fee')).toEqual({ heading: 'Borrow fee', expansion: null });
  });

  it('ignores a parenthesis that is not at the end', () => {
    expect(splitTerm('Limit (LMT) on close')).toEqual({
      heading: 'Limit (LMT) on close',
      expansion: null,
    });
  });
});

describe('indexLetter', () => {
  it('indexes on the first letter, uppercased', () => {
    expect(indexLetter('borrow fee')).toBe('B');
    expect(indexLetter('GUS')).toBe('G');
  });

  it('gathers everything that does not start with a letter under a single bucket', () => {
    expect(indexLetter('% of Total Equity @ Risk')).toBe('#');
    expect(indexLetter('52-week high')).toBe('#');
  });
});
