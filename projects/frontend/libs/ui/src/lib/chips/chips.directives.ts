import { Directive, computed, input } from '@angular/core';

/**
 * Domain-specific chip variants — apply via `[stbChip]` on `<mat-chip>`,
 * `<mat-chip-option>` or `<mat-chip-row>`. The directive posts a `.stb-chip--{variant}`
 * class on the host ; the actual styling lives in `chips.scss` and works by overriding
 * the chip's `--mat-chip-*` CSS variables on the host element.
 *
 *  - `ticker` → **neutral** monospace label on a raised grey surface, for ticker symbols (BAC,
 *    AAPL, NVDA…). Deliberately colourless : green and red are reserved for outcomes, and a green
 *    ticker would read as "this one made money" (colour rule, #203).
 *  - `linked` → info-blue status chip — the row is attached to something.
 *  - `orphan` → warning-amber status chip — the row stands alone with no link yet.
 */
export type StbChipVariant = 'ticker' | 'linked' | 'orphan';

@Directive({
  selector: 'mat-chip[stbChip], mat-chip-option[stbChip], mat-chip-row[stbChip]',

  host: { '[class]': 'hostClass()' },
})
export class StbChip {
  readonly stbChip = input.required<StbChipVariant>();
  protected readonly hostClass = computed(() => `stb-chip--${this.stbChip()}`);
}
