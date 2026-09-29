import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PricePipe } from '../../../shared/price/price.pipe';
import { maxSize } from '../calculator.math';
import { CalculatorStore } from '../calculator.store';
import { CalcBroker } from '../parts/calc-broker';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';

/**
 * The largest short the broker will accept on a stock, right now (#496) — the number typed into the
 * ticket, so the order goes through the first time — and which cap bound it.
 */
@Component({
  selector: 'app-max-card',
  imports: [CalcBroker, CalcField, CalcResult, DecimalPipe, PricePipe, TranslatePipe],
  templateUrl: './max-card.html',
  styleUrl: './card.scss',
})
export class MaxCard {
  private readonly store = inject(CalculatorStore);
  private readonly v = this.store.values;

  private readonly sizing = computed(() => {
    const v = this.v();
    return maxSize(
      v.balance,
      v.maxPrice,
      { leverage: v.leverage, floor: v.marginFloor, lot: v.lot, safety: v.safety },
      v.maxCeiling,
      v.maxLocate,
    );
  });
  readonly size = computed(() => {
    const r = this.sizing();
    return typeof r === 'object' ? r : null;
  });
  readonly underLot = computed(() => this.sizing() === 'under-lot');
  readonly ceiling = computed(() => this.v().maxCeiling);

  constructor() {
    this.store.prefillBalance();
  }
}
