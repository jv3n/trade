import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonToggleModule } from '@portfolioai/ui';
import { PricePipe } from '../../../shared/price/price.pipe';
import {
  LadderRow,
  entryLadder,
  nearestLevel,
  riskInDollars,
  stopPrice,
  usableBuyingPower,
} from '../calculator.math';
import { CalculatorStore, STOP_PRESETS } from '../calculator.store';
import { CalcBroker } from '../parts/calc-broker';
import { CalcCopy } from '../parts/calc-copy';
import { CalcField } from '../parts/calc-field';
import { CalcResult } from '../parts/calc-result';

/**
 * Position size of a short, keyed off the open (#496) : for each entry level above the open, the
 * share count a risk in % of the balance allows before a stop set in % above the open, and the
 * margin the broker holds for it.
 */
@Component({
  selector: 'app-size-card',
  imports: [
    CalcBroker,
    CalcCopy,
    CalcField,
    CalcResult,
    DecimalPipe,
    PricePipe,
    StbButtonToggleModule,
    TranslatePipe,
  ],
  templateUrl: './size-card.html',
  styleUrl: './card.scss',
})
export class SizeCard {
  protected readonly store = inject(CalculatorStore);
  private readonly v = this.store.values;
  readonly stopPresets = STOP_PRESETS;

  readonly risk = computed(() => riskInDollars(this.v().balance, this.v().sizeRisk));
  readonly stop = computed(() => stopPrice(this.v().sizeOpen, this.v().sizeStop));
  private readonly sizing = computed(() =>
    entryLadder(this.risk(), this.v().sizeOpen, this.v().sizeStop, this.v().marginFloor),
  );
  readonly ladder = computed(() => {
    const r = this.sizing();
    return Array.isArray(r) ? r : null;
  });
  /** Why there is no ladder : a stop under the first level, or too far for the risk. */
  readonly issue = computed(() => {
    const r = this.sizing();
    return r === 'no-level' || r === 'too-far' ? r : null;
  });
  private readonly position = computed(() =>
    nearestLevel(this.ladder() ?? [], this.v().sizeOpen, this.v().sizeCurrent, this.v().sizeStop),
  );
  /** The level to highlight ; none once the price has passed the stop. */
  readonly current = computed(() => {
    const p = this.position();
    return typeof p === 'number' ? p : null;
  });
  readonly aboveStop = computed(() => this.position() === 'above-stop');
  readonly usable = computed(() =>
    usableBuyingPower(this.v().balance, this.v().leverage, this.v().safety),
  );
  /** Rows the broker would refuse are flagged, never shown as if they were available (#496). */
  readonly anyRefused = computed(() => this.ladder()?.some((row) => this.isRefused(row)));

  constructor() {
    this.store.prefillBalance();
  }

  isRefused(row: LadderRow): boolean {
    const usable = this.usable();
    return usable !== null && row.margin > usable;
  }
}
