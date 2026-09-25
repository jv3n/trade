import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { PricePipe } from '../../../shared/price/price.pipe';
import { percentMove, priceAfterMove } from '../calculator.math';
import { CalculatorStore } from '../calculator.store';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';
import { priceDigits } from './price-digits';

/** Percent move from one price to another, and the price a percent away. */
@Component({
  selector: 'app-move-card',
  imports: [CalcField, CalcResult, DecimalPipe, PricePipe],
  templateUrl: './move-card.html',
  styleUrl: './card.scss',
})
export class MoveCard {
  private readonly v = inject(CalculatorStore).values;

  readonly move = computed(() => percentMove(this.v().moveFrom, this.v().moveTo));
  readonly movedPrice = computed(() => priceAfterMove(this.v().moveBase, this.v().movePercent));
  readonly priceDigits = priceDigits;
}
