import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PricePipe } from '../../../shared/price/price.pipe';
import { averageAfterAdd } from '../calculator.math';
import { CalculatorStore } from '../calculator.store';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';
import { priceDigits } from './price-digits';

/** The average price and the whole position after a scale-in. */
@Component({
  selector: 'app-avg-card',
  imports: [CalcField, CalcResult, DecimalPipe, PricePipe],
  templateUrl: './avg-card.html',
  styleUrl: './card.scss',
})
export class AvgCard {
  private readonly v = inject(CalculatorStore).values;

  readonly scaleIn = computed(() =>
    averageAfterAdd(
      this.v().avgShares,
      this.v().avgPrice,
      this.v().avgAddShares,
      this.v().avgAddPrice,
    ),
  );
  readonly priceDigits = priceDigits;
}
