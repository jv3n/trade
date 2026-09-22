import { formatNumber } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

/** Below a dollar, a small cap moves in fractions of a cent — above it, cents are enough. */
// Exact counts, not ranges : a column of prices lines up only when every cell has the same number
// of decimals (`0,0300` under `0,4231`), the same reason the fields pad on blur (#335).
const SUB_DOLLAR_DECIMALS = '1.4-4';
const DOLLAR_DECIMALS = '1.2-2';

/**
 * A share price, at the precision the sheet reads it (#311, cf. `PARCOURS.md` > Interface
 * principles) : **2 decimals from $1 up, 4 below**, in the active locale's separator — one setting
 * drives the language and the formats alike.
 *
 * **[reference] decides the precision for a whole row** (#355) : pass the row's own price — the
 * session open, else the previous close — and every price of that row reads at the same precision.
 * Without it a ticker crossing $1 during the day would print `1.33` next to `0.9540` in the same
 * line, and a column whose decimals move is harder to scan than one aligned on the separator.
 *
 * A figure that is **not** a share price keeps deciding for itself : the locate is cents per share,
 * so `| price` with no reference is the right call there.
 *
 * Money amounts (P&L, balances) keep `| number: '1.2-2'` : they are always in dollars, and a
 * four-decimal balance would be noise.
 */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: number | null | undefined, reference?: number | null): string {
    if (value === null || value === undefined) return '';
    const scale = reference ?? value;
    const digits = Math.abs(scale) < 1 ? SUB_DOLLAR_DECIMALS : DOLLAR_DECIMALS;
    return formatNumber(value, this.locale, digits);
  }
}
