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

/**
 * The surface a chip set lies on, when it is not the page's — apply via `[stbChipSet]` on
 * `<mat-chip-set>`, `<mat-chip-listbox>` or `<mat-chip-grid>`. Posts a `.stb-chip-set--{surface}`
 * class ; `chips.scss` re-tints the chips inside it.
 *
 *  - `paper` → a light paper whatever the theme (the note windows, #521) : the chips take the
 *    paper's ink instead of the page's surface, so a dark theme does not drop dark chips on it.
 */
export type StbChipSetSurface = 'paper';

@Directive({
  selector: 'mat-chip-set[stbChipSet], mat-chip-listbox[stbChipSet], mat-chip-grid[stbChipSet]',

  host: { '[class]': 'hostClass()' },
})
export class StbChipSet {
  readonly stbChipSet = input.required<StbChipSetSurface>();
  protected readonly hostClass = computed(() => `stb-chip-set--${this.stbChipSet()}`);
}
