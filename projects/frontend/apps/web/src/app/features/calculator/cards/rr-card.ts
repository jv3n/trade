import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PricePipe } from '../../../shared/price/price.pipe';
import { isDistance, riskReward, stopDistance, targetDistance } from '../calculator.math';
import { CalculatorStore } from '../calculator.store';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';
import { priceDigits } from './price-digits';

/** Distance to the stop and to the target of a short, and the R:R between them. */
@Component({
  selector: 'app-rr-card',
  imports: [CalcField, CalcResult, DecimalPipe, PricePipe, TranslatePipe],
  templateUrl: './rr-card.html',
  styleUrl: './card.scss',
})
export class RrCard {
  private readonly v = inject(CalculatorStore).values;

  private readonly stopSide = computed(() => stopDistance(this.v().rrPrice, this.v().rrStop));
  private readonly targetSide = computed(() => targetDistance(this.v().rrPrice, this.v().rrTarget));
  /** The stop reads from the price and the stop alone — the target is often decided later. */
  readonly toStop = computed(() => {
    const d = this.stopSide();
    return isDistance(d) ? d : null;
  });
  readonly toTarget = computed(() => {
    const d = this.targetSide();
    return isDistance(d) ? d : null;
  });
  readonly stopWrongSide = computed(() => this.stopSide() === 'wrong-side');
  readonly targetWrongSide = computed(() => this.targetSide() === 'wrong-side');
  readonly ratio = computed(() => riskReward(this.v().rrPrice, this.v().rrStop, this.v().rrTarget));
  readonly priceDigits = priceDigits;
}
