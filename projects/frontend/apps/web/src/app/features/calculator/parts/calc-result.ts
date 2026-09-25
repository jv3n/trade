import { Clipboard } from '@angular/cdk/clipboard';
import { Component, DestroyRef, inject, input, numberAttribute, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbIconModule, StbTooltipModule } from '@portfolioai/ui';
import { CALCULATOR_DETACHED } from '../widgets/calculator-widgets';

/** How long a copied result shows its check before going back to the copy icon. */
const COPIED_FOR_MS = 1200;

/**
 * A result of a calculator card : shown formatted, **copied as a bare number** — `454`, `3.23`,
 * `-16.4` — ready to paste into the broker, a spreadsheet or a field of the app : no grouping, no
 * currency, a dot for the decimals, whatever the display shows (#406).
 */
@Component({
  selector: 'app-calc-result',
  imports: [StbButtonModule, StbIconModule, StbTooltipModule, TranslatePipe],
  template: `
    <div class="result">
      <span class="result__label">{{ label() | translate }}</span>
      <output
        class="result__value"
        [class.profit-positive]="(tone() ?? 0) > 0"
        [class.profit-negative]="(tone() ?? 0) < 0"
        >{{ text() ?? '—' }}</output
      >
      <button
        mat-icon-button
        stbSize="sm"
        type="button"
        [disabled]="value() === null"
        (click)="copy()"
        [matTooltip]="'calculator.copy' | translate"
        [matTooltipDisabled]="detached?.() ?? false"
        [attr.aria-label]="'calculator.copy' | translate"
      >
        <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
      </button>
    </div>
  `,
  styleUrl: './calc-result.scss',
})
export class CalcResult {
  private readonly clipboard = inject(Clipboard);
  protected readonly detached = inject(CALCULATOR_DETACHED, { optional: true });
  private timer?: ReturnType<typeof setTimeout>;

  readonly label = input.required<string>();
  /** The result as it reads, formatted. « — » while the card is incomplete. */
  readonly text = input.required<string | null>();
  /** What is copied ; null while there is nothing to copy. */
  readonly value = input.required<number | null>();
  /** Decimals the value is copied with — the precision it is shown with. */
  readonly digits = input.required({ transform: numberAttribute });
  /** The signed outcome that colours the result green or red, when it is one (a P&L). */
  readonly tone = input<number | null | undefined>(null);

  readonly copied = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  copy(): void {
    const value = this.value();
    if (value === null) return;
    this.clipboard.copy(value.toFixed(this.digits()));
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), COPIED_FOR_MS);
  }
}
