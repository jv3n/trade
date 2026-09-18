import { Directive, computed, input } from '@angular/core';

/** Available button sizes. `sm` is the design-system default (32 px height). */
export type StbButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Adds a `stb-size--{xs|sm|md|lg}` class on a Material button (or icon-button) so the lib's
 * `button.scss` can swap the MDC container height + label font-size tokens for that size.
 *
 * Usage :
 *
 * ```html
 * <button mat-flat-button stbSize="lg">Login with Google</button>
 * <button mat-icon-button stbSize="xs"><mat-icon>close</mat-icon></button>
 * ```
 *
 * The directive doesn't do any styling itself — it only applies the class. The actual size
 * overrides live in `libs/ui/src/lib/button/button.scss` (the `.stb-size--*` rules).
 */
@Directive({
  selector: `
    button[mat-button][stbSize], a[mat-button][stbSize],
    button[mat-flat-button][stbSize], a[mat-flat-button][stbSize],
    button[mat-stroked-button][stbSize], a[mat-stroked-button][stbSize],
    button[mat-raised-button][stbSize], a[mat-raised-button][stbSize],
    button[mat-icon-button][stbSize], a[mat-icon-button][stbSize],
    button[mat-fab][stbSize], button[mat-mini-fab][stbSize]
  `,

  host: {
    '[class]': 'hostClass()',
  },
})
export class StbSize {
  readonly stbSize = input.required<StbButtonSize>();

  protected readonly hostClass = computed(() => `stb-size--${this.stbSize()}`);
}

/**
 * Pushes a `<mat-spinner>` to the **end** of its parent button — the lib button slots
 * icons before the label by default (Material's leading-icon slot), so the spinner of a
 * loading CTA usually lives at the start. Add `stbSpinnerEnd` to put it after the label
 * instead (matches the visual cue "→ working on it").
 *
 * ```html
 * <button mat-flat-button [disabled]="loading()">
 *   <span>Save</span>
 *   <mat-spinner stbSpinnerEnd diameter="16"></mat-spinner>
 * </button>
 * ```
 *
 * Pure marker — the actual `order` / margin rules live in `button.scss`.
 */
@Directive({
  selector: 'mat-spinner[stbSpinnerEnd], mat-progress-spinner[stbSpinnerEnd]',

  host: { class: 'stb-spinner-end' },
})
export class StbSpinnerEnd {}
