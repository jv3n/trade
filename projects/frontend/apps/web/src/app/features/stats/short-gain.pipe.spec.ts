import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ShortGainPipe } from './short-gain.pipe';

/**
 * The drop after a double top's retest is a fall of the price, and a gain for the short (#706). The
 * colour rule keeps red for losses : shown as the price change, the best setups would read red.
 */
describe('ShortGainPipe', () => {
  registerLocaleData(localeFr);

  function pipeFor(locale: string): ShortGainPipe {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ShortGainPipe, { provide: LOCALE_ID, useValue: locale }],
    });
    return TestBed.inject(ShortGainPipe);
  }

  it('reads a fall of the price as a signed gain for the short', () => {
    expect(pipeFor('en').transform(-17.12)).toBe('+17.1');
  });

  // PRSO-like : the retest stopped above the sheet's entry and the drop never got under it.
  it('reads a rise from the entry as a loss for the short', () => {
    expect(pipeFor('en').transform(2.04)).toBe('−2.0');
  });

  it('follows the locale separator', () => {
    expect(pipeFor('fr').transform(-15.33)).toBe('+15,3');
  });

  it('shows nothing when there is no drop typed', () => {
    expect(pipeFor('en').transform(null)).toBe('');
  });
});
