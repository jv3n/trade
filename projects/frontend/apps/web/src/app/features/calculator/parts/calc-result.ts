import { Component, booleanAttribute, input, numberAttribute } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CalcCopy } from './calc-copy';

/** A result of a calculator card : shown formatted, copied as a bare number (#406). */
@Component({
  selector: 'app-calc-result',
  imports: [CalcCopy, TranslatePipe],
  template: `
    <div class="result" [class.result--headline]="headline()">
      <span class="result__label">{{ label() | translate }}</span>
      <output class="result__value">{{ text() ?? '—' }}</output>
      <app-calc-copy [value]="value()" [digits]="digits()" />
    </div>
  `,
  styleUrl: './calc-result.scss',
})
export class CalcResult {
  readonly label = input.required<string>();
  /** The result as it reads, formatted. « — » while the card is incomplete. */
  readonly text = input.required<string | null>();
  /** What is copied ; null while there is nothing to copy. */
  readonly value = input.required<number | null>();
  /** Decimals the value is copied with — the precision it is shown with. */
  readonly digits = input.required({ transform: numberAttribute });
  /** The figure the card is for — the one typed into the ticket — set larger than the rest. */
  readonly headline = input(false, { transform: booleanAttribute });
}
