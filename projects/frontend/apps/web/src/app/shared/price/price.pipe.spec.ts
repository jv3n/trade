import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PricePipe } from './price.pipe';

/**
 * A share price is read at two precisions (#311) : cents from $1 up, fractions of a cent below,
 * where a small cap actually moves. The separator follows the locale, since one setting drives the
 * language and the formats alike.
 */
describe('PricePipe', () => {
  registerLocaleData(localeFr);

  function pipeFor(locale: string): PricePipe {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PricePipe, { provide: LOCALE_ID, useValue: locale }],
    });
    return TestBed.inject(PricePipe);
  }

  it('shows cents from a dollar up', () => {
    expect(pipeFor('en').transform(4.2)).toBe('4.20');
    expect(pipeFor('en').transform(12.3456)).toBe('12.35');
  });

  it('shows fractions of a cent below a dollar, padded so a column lines up', () => {
    expect(pipeFor('en').transform(0.4231)).toBe('0.4231');
    expect(pipeFor('en').transform(0.42)).toBe('0.4200');
  });

  it('follows the locale separator', () => {
    expect(pipeFor('fr').transform(4.2)).toBe('4,20');
  });

  // #355 : a ticker crossing $1 during the day printed `1.33` next to `0.9540` on one line.
  it('takes its precision from the row reference, not from each value', () => {
    const pipe = pipeFor('en');

    // A day opened at 1.33 : the LOD under a dollar stays on the row's two decimals.
    expect(pipe.transform(0.954, 1.33)).toBe('0.95');
    // A sub-dollar day : the price that pokes above $1 keeps the row's four.
    expect(pipe.transform(1.02, 0.42)).toBe('1.0200');
  });

  it('falls back to the value itself when no reference is given — the locate does that', () => {
    expect(pipeFor('en').transform(0.03)).toBe('0.0300');
    expect(pipeFor('en').transform(0.03, null)).toBe('0.0300');
  });

  it('leaves nothing to show as an empty string, never « null »', () => {
    expect(pipeFor('en').transform(null)).toBe('');
  });
});
