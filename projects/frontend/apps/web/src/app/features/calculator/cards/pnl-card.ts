import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { shortPnl } from '../calculator.math';
import { CalculatorStore } from '../calculator.store';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';

/** The P&L of a short, in $ and in % of the position. */
@Component({
  selector: 'app-pnl-card',
  imports: [CalcField, CalcResult, DecimalPipe, TranslatePipe],
  templateUrl: './pnl-card.html',
  styleUrl: './card.scss',
})
export class PnlCard {
  private readonly v = inject(CalculatorStore).values;

  readonly pnl = computed(() =>
    shortPnl(this.v().pnlEntry, this.v().pnlCover, this.v().pnlShares, this.v().pnlFees),
  );
}
