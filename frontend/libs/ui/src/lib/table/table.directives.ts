import { Directive, computed, input } from '@angular/core';

/**
 * Lib directive that wraps a `<table mat-table>` inside a styled container :
 * surface background, border, radius and horizontal overflow scroll. Drop it on a
 * `<div>` that hosts the table — no class name needed on the consumer side.
 */
@Directive({
  selector: 'div[stbTable]',

  host: { class: 'stb-table' },
})
export class StbTable {}

export type StbTableColVariant = 'numeric' | 'mono' | 'actions';

/**
 * Apply common cell-level styling without sprinkling utility classes through the
 * template. Variants :
 *
 *  - `numeric`  → right-aligned, tabular-nums (for prices, sizes, PnL columns).
 *  - `mono`     → monospace + slightly smaller text (for tickers, IDs).
 *  - `actions`  → fixed-width right-aligned column meant for icon-button rows.
 *
 * `mat-table` does not bubble column-level classes to cells, so the directive must
 * be applied on **both** the `<th mat-header-cell>` and the `<td mat-cell>`.
 */
@Directive({
  selector: 'th[stbCol], td[stbCol]',

  host: { '[class]': 'hostClass()' },
})
export class StbCol {
  readonly stbCol = input.required<StbTableColVariant>();
  protected readonly hostClass = computed(() => `stb-col--${this.stbCol()}`);
}
