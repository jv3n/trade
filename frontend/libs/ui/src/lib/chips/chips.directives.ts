import { Directive, computed, input } from '@angular/core';

/**
 * Domain-specific chip variants — apply via `[stbChip]` on `<mat-chip>`,
 * `<mat-chip-option>` or `<mat-chip-row>`. The directive posts a `.stb-chip--{variant}`
 * class on the host ; the actual styling lives in `chips.scss` and works by overriding
 * the chip's `--mat-chip-*` CSS variables on the host element.
 *
 *  - `ticker` → label rendered in the success-green palette, matching the trading-domain
 *    convention used for ticker symbols (BAC, AAPL, NVDA…). Selected ticker chips swap to
 *    the success-soft container.
 */
export type StbChipVariant = 'ticker';

@Directive({
  selector: 'mat-chip[stbChip], mat-chip-option[stbChip], mat-chip-row[stbChip]',
  standalone: true,
  host: { '[class]': 'hostClass()' },
})
export class StbChip {
  readonly stbChip = input.required<StbChipVariant>();
  protected readonly hostClass = computed(() => `stb-chip--${this.stbChip()}`);
}
