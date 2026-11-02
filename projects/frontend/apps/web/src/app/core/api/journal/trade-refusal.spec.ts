import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { tradeRefusalKey } from './trade-refusal';

/**
 * Pins the reading of a refused trade write (#863) : a known code gives its translated reason, and
 * anything else gives null so the page keeps its generic toast rather than showing a raw i18n key.
 */
describe('tradeRefusalKey', () => {
  const refused = (error: unknown): HttpErrorResponse =>
    new HttpErrorResponse({ status: 400, error });

  it('gives the reason of a known code', () => {
    const error = refused({ error: 'A trade can not be dated in the future', code: 'FUTURE_DATE' });

    expect(tradeRefusalKey(error)).toBe('journal.refused.futureDate');
  });

  it('gives null for a code the frontend does not know yet', () => {
    expect(tradeRefusalKey(refused({ code: 'SOMETHING_NEW' }))).toBeNull();
  });

  it('gives null for a refusal without a code', () => {
    expect(tradeRefusalKey(refused({ error: 'Value out of range' }))).toBeNull();
  });

  it('gives null for a failure that is not an HTTP answer', () => {
    expect(tradeRefusalKey(new Error('boom'))).toBeNull();
  });
});
