import { formatNumber } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

/**
 * A price change read as what a short makes (#706) : `−17.1` on the price is `+17.1` for the short.
 * The drop of a double top is stored and computed with its sign ; only the screen flips it, so the
 * best setups read as gains, never as red falls. Signed, one decimal, no unit — the `%` sits in the
 * translation. Empty when there is no change to read.
 */
@Pipe({ name: 'shortGain' })
export class ShortGainPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(change: number | null | undefined): string {
    if (change === null || change === undefined) return '';
    const gain = -change;
    const sign = gain > 0 ? '+' : gain < 0 ? '−' : '';
    return sign + formatNumber(Math.abs(gain), this.locale, '1.1-1');
  }
}
