import { describe, expect, it } from 'vitest';
import en from '../../../../public/i18n/en.json';
import fr from '../../../../public/i18n/fr.json';

/**
 * Every amount ends with `account.usdSuffix`, every column header with `account.usdUnit` (#312). A
 * plain space in either let the currency wrap away from its number at a line end — `8 493,30` on
 * one line, `$ US` on the next, in the narrow account card of `/today` (#389).
 */
describe('currency keys', () => {
  it.each([
    ['fr', fr],
    ['en', en],
  ])('keep the currency on the line of its amount in %s', (_lang, messages) => {
    expect(messages.account.usdSuffix).not.toMatch(/\u0020/);
    expect(messages.account.usdUnit).not.toMatch(/\u0020/);
    // The suffix is appended straight to the number : it opens on its own no-break space.
    expect(messages.account.usdSuffix.startsWith('\u00a0')).toBe(true);
  });
});
