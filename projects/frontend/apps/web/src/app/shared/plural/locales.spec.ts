import { describe, expect, it } from 'vitest';
import en from '../../../../public/i18n/en.json';
import fr from '../../../../public/i18n/fr.json';

/**
 * The two locales carry the same keys. A key missing from one fails silently — ngx-translate prints
 * it raw, in the language nobody was testing — and the `plural` pipe makes that easy to do, since
 * it reaches for a `…One` sibling the caller never names (#382).
 */
function leafKeys(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? leafKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('i18n locales', () => {
  it('French and English carry exactly the same keys', () => {
    const french = new Set(leafKeys(fr));
    const english = new Set(leafKeys(en));

    expect([...french].filter((k) => !english.has(k))).toEqual([]);
    expect([...english].filter((k) => !french.has(k))).toEqual([]);
  });

  it('every singular key has the plural key the pipe falls back to', () => {
    // `confirmPromoteAllOne.title` is a leaf of a `…One` group : its base is `confirmPromoteAll.title`.
    const keys = new Set(leafKeys(fr));
    const orphans = [...keys]
      .filter((k) => /One(\.|$)/.test(k))
      .filter((k) => !keys.has(k.replace(/One(?=\.|$)/, '')));

    expect(orphans).toEqual([]);
  });
});
