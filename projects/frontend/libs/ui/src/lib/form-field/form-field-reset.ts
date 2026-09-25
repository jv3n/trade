import { Component, afterEveryRender, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StbSize } from '../button/button.directives';
import { StbFormFieldResetIntl } from './form-field-reset-intl';

/** The `<input>` / `<textarea>` a [StbFormFieldReset] empties. */
export type StbResettableField = HTMLInputElement | HTMLTextAreaElement;

/**
 * The ✕ that empties the field it sits in — a `matIconSuffix` of a `<mat-form-field>`, pointed at
 * the field's own element :
 *
 * ```html
 * <mat-form-field>
 *   <mat-label>Ticker</mat-label>
 *   <input #ticker matInput [formField]="captureForm.ticker" />
 *   <ui-form-field-reset matIconSuffix [for]="ticker" />
 * </mat-form-field>
 * ```
 *
 * It shows only while the field holds something, and it clears it the way the user would : the
 * value is emptied on the element, then an `input` + `change` pair is dispatched. Every binding
 * shape follows on its own — Signal Forms `[formField]`, a numeric mask reading `[value]` and
 * emitting its own output, or a plain `[value]` + `(input)` signal — and so does the form field's
 * floating label. Clearing creates and deletes nothing, so there is no confirmation.
 *
 * A click never takes the focus off the field : a form that saves on blur (the stats sheet) would
 * otherwise store the old value first, and clear it only on the next blur.
 *
 * The button is deliberately **out of the tab order** : a form is typed field by field with Tab,
 * and a stop between each field would cost more than the ✕ saves. From the keyboard the field is
 * still emptied the usual way, from inside it.
 */
@Component({
  selector: 'ui-form-field-reset',
  exportAs: 'stbFormFieldReset',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, StbSize],
  template: `
    @if (filled()) {
      <button
        mat-icon-button
        stbSize="xs"
        type="button"
        tabindex="-1"
        data-testid="reset"
        [matTooltip]="intl.resetField()"
        [attr.aria-label]="intl.resetField()"
        (mousedown)="$event.preventDefault()"
        (click)="reset()"
      >
        <mat-icon>close</mat-icon>
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  host: {
    class: 'stb-form-field-reset',
    // Lets `form-field.scss` collapse the suffix container while there is nothing to clear, so an
    // empty field keeps the width it had before the button existed.
    '[class.stb-form-field-reset--idle]': '!filled()',
  },
})
export class StbFormFieldReset {
  protected readonly intl = inject(StbFormFieldResetIntl);

  /**
   * The field to empty — its template reference (`<input #ticker matInput />`). Named `for` after
   * `mat-datepicker-toggle`'s, and unaliased so the lint rule on renamed inputs stays satisfied.
   */
  readonly for = input.required<StbResettableField>();

  /** Emitted once the field has been emptied, for a caller with more to reset than the value. */
  readonly cleared = output<void>();

  protected readonly filled = signal(false);

  constructor() {
    // The value lives on the element (`[value]`, Signal Forms, the number mask), so there is no
    // signal to derive from : the field is read once each render is done. Not in `ngDoCheck` —
    // `MatInput` writes `disabled` in its host bindings, after that hook, and nothing re-checks the
    // view afterwards, so a field disabled in the same pass kept its ✕. A field the user cannot
    // edit, disabled or read-only, is not one they can empty.
    afterEveryRender({
      read: () => {
        const field = this.for();
        this.filled.set(field.value !== '' && !field.matches(':disabled, :read-only'));
      },
    });
  }

  protected reset(): void {
    const field = this.for();
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    // The user is about to retype ; a form that saves on blur stores the cleared value when the
    // focus finally leaves.
    field.focus();
    this.cleared.emit();
  }
}
