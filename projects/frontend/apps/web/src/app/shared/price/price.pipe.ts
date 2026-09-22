import { formatNumber } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

/** Below a dollar, a small cap moves in fractions of a cent — above it, cents are enough. */
const SUB_DOLLAR_DECIMALS = '1.2-4';
const DOLLAR_DECIMALS = '1.2-2';

/**
 * A share price, at the precision the sheet reads it (#311, cf. `PARCOURS.md` > Interface
 * principles) : **2 decimals from $1 up, 4 below**, in the active locale's separator — one setting
 * drives the language and the formats alike.
 *
 * Money amounts (P&L, balances) keep `| number: '1.2-2'` : they are always in dollars, and a
 * four-decimal balance would be noise.
 */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const digits = Math.abs(value) < 1 ? SUB_DOLLAR_DECIMALS : DOLLAR_DECIMALS;
    return formatNumber(value, this.locale, digits);
  }
}
