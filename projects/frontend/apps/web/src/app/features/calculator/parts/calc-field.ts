import { Component, booleanAttribute, inject, input, numberAttribute } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StbFormFieldModule, StbInputModule } from '@portfolioai/ui';
import { NumberMaskDirective } from '../../../shared/number-mask/number-mask.directive';
import { CalculatorField, CalculatorStore } from '../calculator.store';

/**
 * One number of a calculator card, read from and written to [CalculatorStore] — so a card on the
 * page and the same card in a floating widget show the same figure. The unit sits inside the field
 * as a suffix rather than in the label (#408) : a label stays short enough for a widget's width.
 */
@Component({
  selector: 'app-calc-field',
  imports: [NumberMaskDirective, StbFormFieldModule, StbInputModule, TranslatePipe],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() | translate }}</mat-label>
      <input
        #numberInput
        matInput
        appNumberMask
        [decimals]="decimals()"
        [min]="allowNegative() ? null : 0"
        [allowNegative]="allowNegative()"
        [number]="store.values()[field()]"
        [placeholder]="placeholder() ? (placeholder()! | translate) : ''"
        (numberChange)="store.set(field(), $event)"
      />
      @if (suffix(); as unit) {
        <span matTextSuffix class="calc-unit">{{ unit | translate }}</span>
      }
      <ui-form-field-reset matIconSuffix [for]="numberInput" />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    mat-form-field {
      width: 100%;
    }

    .calc-unit {
      color: var(--color-text-faint);
      white-space: nowrap;
    }
  `,
})
export class CalcField {
  protected readonly store = inject(CalculatorStore);

  readonly field = input.required<CalculatorField>();
  /** Translation key of the label. */
  readonly label = input.required<string>();
  /** 4 for a price, 2 for an amount, 0 for a share count. */
  readonly decimals = input.required({ transform: numberAttribute });
  readonly allowNegative = input(false, { transform: booleanAttribute });
  /** Translation key of the unit shown inside the field. */
  readonly suffix = input<string | null>(null);
  /** Translation key of the text an empty field shows. */
  readonly placeholder = input<string | null>(null);
}
