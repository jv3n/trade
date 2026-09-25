import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { positionSize } from '../calculator.math';
import { CalculatorStore } from '../calculator.store';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';

/** Position size of a short : the share count a risk in $ allows, rounded down. */
@Component({
  selector: 'app-size-card',
  imports: [CalcField, CalcResult, DecimalPipe, TranslatePipe],
  templateUrl: './size-card.html',
  styleUrl: './card.scss',
})
export class SizeCard {
  private readonly v = inject(CalculatorStore).values;

  private readonly sizing = computed(() =>
    positionSize(this.v().sizeRisk, this.v().sizeEntry, this.v().sizeStop),
  );
  readonly size = computed(() => {
    const r = this.sizing();
    return typeof r === 'object' ? r : null;
  });
  /** Why there is no share count : a stop on the wrong side, or too far for the risk. */
  readonly issue = computed(() => {
    const r = this.sizing();
    return r === 'wrong-side' || r === 'too-far' ? r : null;
  });
}
