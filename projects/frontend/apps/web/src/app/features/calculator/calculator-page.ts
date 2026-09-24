import { Clipboard } from '@angular/cdk/clipboard';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  StbButtonModule,
  StbFormFieldModule,
  StbIconModule,
  StbInputModule,
  StbTooltipModule,
} from '@portfolioai/ui';
import { NumberMaskDirective } from '../../shared/number-mask/number-mask.directive';
import { PricePipe } from '../../shared/price/price.pipe';
import {
  averageAfterAdd,
  isDistance,
  percentMove,
  positionSize,
  priceAfterMove,
  riskReward,
  shortPnl,
  stopDistance,
  targetDistance,
} from './calculator.math';
import { CalculatorField, CalculatorStore } from './calculator.store';

/** How long a copied result shows its check before going back to the copy icon. */
const COPIED_FOR_MS = 1200;

/**
 * Calculator (#388, cf. `mockup/calculatrice.html`) — the small sums a trader redoes by hand, one
 * card each, all on screen. Results follow the typing ; nothing reaches the backend, and the values
 * live in [CalculatorStore] until the next reload.
 */
@Component({
  selector: 'app-calculator-page',
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    NumberMaskDirective,
    PricePipe,
    StbButtonModule,
    StbFormFieldModule,
    StbIconModule,
    StbInputModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './calculator-page.html',
  styleUrl: './calculator-page.scss',
})
export class CalculatorPage {
  private readonly store = inject(CalculatorStore);
  private readonly clipboard = inject(Clipboard);
  private copiedTimer?: ReturnType<typeof setTimeout>;

  readonly v = this.store.values;

  readonly move = computed(() => percentMove(this.v().moveFrom, this.v().moveTo));
  readonly movedPrice = computed(() => priceAfterMove(this.v().moveBase, this.v().movePercent));
  private readonly sizing = computed(() =>
    positionSize(this.v().sizeRisk, this.v().sizeEntry, this.v().sizeStop),
  );
  readonly size = computed(() => {
    const r = this.sizing();
    return typeof r === 'object' ? r : null;
  });
  /** Why there is no share count : a stop on the wrong side, or too far for the risk. */
  readonly sizeIssue = computed(() => {
    const r = this.sizing();
    return r === 'wrong-side' || r === 'too-far' ? r : null;
  });
  readonly pnl = computed(() =>
    shortPnl(this.v().pnlEntry, this.v().pnlCover, this.v().pnlShares, this.v().pnlFees),
  );
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
  readonly scaleIn = computed(() =>
    averageAfterAdd(
      this.v().avgShares,
      this.v().avgPrice,
      this.v().avgAddShares,
      this.v().avgAddPrice,
    ),
  );

  /** The result just copied — its button shows a check for a moment. */
  readonly copied = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  /** A field's value — typed here, since the templates' `let-field` context is `any`. */
  fieldValue(field: CalculatorField): number | null {
    return this.v()[field];
  }

  set(field: CalculatorField, value: number | null): void {
    this.store.set(field, value);
  }

  /** Decimals a price is copied with — the precision it is shown with (#311). */
  priceDigits(price: number | null): number {
    return price !== null && Math.abs(price) < 1 ? 4 : 2;
  }

  /**
   * Copies a result as a bare number — `454`, `3.23`, `-16.4` — ready to paste into the broker or
   * a spreadsheet : no grouping, no currency, a dot for the decimals, whatever the display shows.
   */
  copy(key: string, value: number | null, digits: number): void {
    if (value === null) return;
    this.clipboard.copy(value.toFixed(digits));
    this.copied.set(key);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.copied.set(null), COPIED_FOR_MS);
  }
}
